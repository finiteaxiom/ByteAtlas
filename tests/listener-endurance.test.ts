import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { ChangeMonitor } from '../src/backend/change-monitor';
import { IndexStore } from '../src/backend/index-store';
import { within } from '../src/backend/path-safety';
import { Scanner } from '../src/backend/scanner';

const enabled=process.env.BYTEATLAS_LISTENER_ENDURANCE==='1';
const durationMs=Number(process.env.BYTEATLAS_LISTENER_ENDURANCE_MS ?? 86_400_000);
const sampleEveryMs=Number(process.env.BYTEATLAS_LISTENER_SAMPLE_MS ?? 300_000);
const artifacts=resolve('.artifacts');

async function until(fn:()=>boolean, label:string, timeoutMs=30_000):Promise<void> {
  const started=Date.now();
  while(Date.now()-started<timeoutMs) {if(fn())return;await delay(50);}
  throw Error(`Timed out waiting for ${label}`);
}

/** A deliberately opt-in, checkpointed 24-hour fixture test.  Its limits are
 * observed product limits (256 handles / 128 dirty paths); memory is recorded
 * for review rather than given a new, invented product threshold. */
it.runIf(enabled)('keeps a bounded listener convergent over the requested duration',async()=>{
  await mkdir(artifacts,{recursive:true});
  const base=await mkdtemp(join(artifacts,'listener-endurance-'));
  let root=join(base,'source');
  const checkpoint=join(base,'checkpoint.json');
  const report:{startedAt:string; configuredDurationMs:number; phases:unknown[]; samples:unknown[]; passed?:boolean; stopped?:unknown}={startedAt:new Date().toISOString(),configuredDurationMs:durationMs,phases:[],samples:[]};
  const save=async(phase:string, extra:Record<string,unknown>={})=>{
    const snapshot={phase,at:new Date().toISOString(),elapsedMs:Date.now()-Date.parse(report.startedAt),...extra};
    report.phases.push(snapshot);await writeFile(checkpoint,JSON.stringify({...report,last:snapshot},null,2));
  };
  const store=new IndexStore(join(base,'index.sqlite')),scanner=new Scanner(store),monitor=new ChangeMonitor(store,scanner,50,1_000);
  try {
    await mkdir(root);
    for(let index=0;index<270;index++)await mkdir(join(root,`目录_${String(index).padStart(3,'0')}`));
    const stablePath=join(root,'稳定.txt');await writeFile(stablePath,'stable');
    const world=await scanner.create(root);await scanner.control(world.id,'start');await until(()=>!scanner.busy,'initial scan');
    const stable=store.search(world.id,'稳定',null).entries[0]!;
    expect(stable.observedAt).toBeNull();
    monitor.enable(world.id);await until(()=>store.world(world.id).monitor==='fallback','fallback mode');
    expect(monitor.status().handles).toBeLessThanOrEqual(256);await save('initial-fallback',{worldId:world.id,monitor:monitor.status(),fileCount:store.entry(world.id,world.rootId).fileCount});

    // This immediately pauses an active scan; it proves the control signal is
    // not merely an idle-state transition before the endurance loop begins.
    await writeFile(join(root,'暂停基线.txt'),'pause');await scanner.control(world.id,'start');await scanner.control(world.id,'pause');
    await until(()=>store.world(world.id).state==='paused','paused scan');await scanner.control(world.id,'resume');await until(()=>!scanner.busy,'resumed scan');
    await save('pause-resume',{state:store.world(world.id).state});
    await writeFile(join(root,'取消基线.txt'),'cancel');await scanner.control(world.id,'start');await scanner.control(world.id,'cancel');
    expect(store.world(world.id).state).toBe('cancelled');await scanner.control(world.id,'start');await until(()=>!scanner.busy,'post-cancel scan');await save('cancel-restart',{state:store.world(world.id).state});

    let nextSample=0;let cycle=0;
    while(Date.now()-Date.parse(report.startedAt)<durationMs) {
      const cycleDirectory=join(root,`目录_${String(cycle%270).padStart(3,'0')}`);
      const created=join(cycleDirectory,`新增_${cycle}.txt`);const renamed=join(cycleDirectory,`改名_${cycle}.txt`);
      await writeFile(created,`batch-${cycle}`);await writeFile(join(root,`批量_${cycle}.txt`),'x'.repeat((cycle%11)+1));
      monitor.invalidate();await until(()=>store.search(world.id,`新增_${cycle}`,null).entries.length===1&&!scanner.busy,'create reconciliation');
      await writeFile(created,`changed-${cycle}-size`);monitor.invalidate();await until(()=>store.search(world.id,`新增_${cycle}`,null).entries[0]?.bytes===String(Buffer.byteLength(`changed-${cycle}-size`))&&!scanner.busy,'modify reconciliation');
      await rename(created,renamed);monitor.invalidate();await until(()=>store.search(world.id,`改名_${cycle}`,null).entries.length===1&&!scanner.busy,'rename reconciliation');
      await rm(renamed);monitor.invalidate();await until(()=>store.search(world.id,`改名_${cycle}`,null).entries.length===0&&!scanner.busy,'delete reconciliation');
      expect(store.entry(world.id,stable.id).slot).toBe(stable.slot);expect(store.entry(world.id,stable.id).observedAt).toBeNull();
      expect(monitor.status().handles).toBeLessThanOrEqual(256);expect(monitor.status().dirtyDirectories).toBeLessThanOrEqual(128);

      // One offline / restore cycle is sufficient; repeating it would leave a
      // long-running verifier unable to distinguish recovery from routine IO.
      if(cycle===1) {
        const offline=join(base,'offline-source');await rename(root,offline);monitor.invalidate();await until(()=>store.world(world.id).state==='unavailable','offline root');
        await rename(offline,root);monitor.invalidate();await until(()=>store.world(world.id).state==='complete'&&!scanner.busy,'restored root');await save('offline-restore',{state:store.world(world.id).state});
      }
      const now=Date.now();if(now>=nextSample) {const rootEntry=store.entry(world.id,world.rootId);const disk=await stat(stablePath);const sample={at:new Date().toISOString(),elapsedMs:now-Date.parse(report.startedAt),rss:process.memoryUsage().rss,handles:monitor.status().handles,dirtyDirectories:monitor.status().dirtyDirectories,fileCount:rootEntry.fileCount,bytes:rootEntry.bytes,stableBytes:disk.size};report.samples.push(sample);await save('sample',sample);nextSample=now+sampleEveryMs;}
      cycle++;await delay(Math.min(1_000,Math.max(100,durationMs/20)));
    }
    monitor.disable(world.id);expect(monitor.status()).toMatchObject({handles:0,dirtyDirectories:0,worldId:undefined});
    report.stopped=monitor.status();report.passed=true;await save('stopped',{monitor:monitor.status(),cycles:cycle});
  } finally {
    await monitor.stop();store.close();
    // Retain the fixture and checkpoint for a completed or interrupted run;
    // it is under .artifacts and may be removed only after evidence review.
    if(!within(artifacts,base))throw Error('Unsafe endurance fixture location');
  }
},durationMs+120_000);
