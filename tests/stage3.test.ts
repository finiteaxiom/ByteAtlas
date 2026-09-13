import { mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { IndexStore } from '../src/backend/index-store';
import { Scanner } from '../src/backend/scanner';
import { ChangeMonitor } from '../src/backend/change-monitor';
import { within } from '../src/backend/path-safety';
import { activityScore } from '../src/shared/world/activity';

async function until(fn:()=>boolean) {for(let i=0;i<400;i++){if(fn())return;await delay(25);}throw Error('Reconciliation timeout');}
it('native watch converges create/change/rename/delete and retains layout without false initial activity',async()=>{
  const artifacts=resolve('.artifacts');await mkdir(artifacts,{recursive:true});
  const base=await mkdtemp(join(artifacts,'stage3-'));const root=join(base,'source');await mkdir(root);
  const store=new IndexStore(join(base,'index.sqlite')),scanner=new Scanner(store),monitor=new ChangeMonitor(store,scanner,25,60000);
  try {
    await writeFile(join(root,'保留.txt'),'keep');await mkdir(join(root,'仓库'));await writeFile(join(root,'仓库','.git'),'metadata marker');
    const world=await scanner.create(root);await scanner.control(world.id,'start');await until(()=>!scanner.busy);
    const stable=store.search(world.id,'保留',null).entries[0]!;expect(stable.observedAt).toBeNull();
    const repository=store.search(world.id,'仓库',null).entries.find(e=>e.kind==='directory')!;expect(repository.repository).toBe(true);
    monitor.enable(world.id);await until(()=>store.world(world.id).monitor==='watching');await delay(100);
    await writeFile(join(root,'新增 & $.txt'),'new');
    await until(()=>store.search(world.id,'新增',null).entries.length===1&&!scanner.busy);
    const added=store.search(world.id,'新增',null).entries[0]!;expect(added.changeKind).toBe('added');expect(added.observedAt).not.toBeNull();
    await writeFile(join(root,'新增 & $.txt'),'changed-size');
    await until(()=>store.entry(world.id,added.id).bytes==='12');
    await rename(join(root,'新增 & $.txt'),join(root,'改名.txt'));
    await until(()=>store.search(world.id,'改名',null).entries.length===1&&store.search(world.id,'新增',null).entries.length===0);
    await rm(join(root,'改名.txt'));
    await until(()=>store.search(world.id,'改名',null).entries.length===0);
    expect(store.entry(world.id,stable.id).slot).toBe(stable.slot);expect(store.entry(world.id,stable.id).observedAt).toBeNull();
    monitor.disable(world.id);await scanner.stop();await scanner.control(world.id,'start');await until(()=>!scanner.busy);
    expect(store.entry(world.id,stable.id).observedAt).toBeNull();
    await writeFile(join(root,'手动刷新.txt'),'verified change');
    await scanner.control(world.id,'start');await until(()=>!scanner.busy);
    expect(store.search(world.id,'手动刷新',null).entries[0]).toMatchObject({changeKind:'added'});
    expect(store.scene(world.id,world.rootId,1,added.id).selected).toBeNull();
  }finally{await monitor.stop();store.close();if(!within(artifacts,base))throw Error('Unsafe fixture cleanup');await rm(base,{recursive:true,force:true});}
},20000);

it('migrates schema 2 in place without losing world IDs, layout, camera or byte totals',async()=>{
  const artifacts=resolve('.artifacts');await mkdir(artifacts,{recursive:true});const base=await mkdtemp(join(artifacts,'migration-'));const path=join(base,'index.sqlite');
  let store=new IndexStore(path);
  try {
    const world=store.createWorld(join(base,'source'));store.saveView(world.id,{directoryId:world.rootId,selectedId:null,page:1,mode:'type',theme:'dusk'});store.close();
    const db=new DatabaseSync(path);
    db.exec('ALTER TABLE entries DROP COLUMN observedAt; ALTER TABLE entries DROP COLUMN changeKind; ALTER TABLE entries DROP COLUMN repository; ALTER TABLE worlds DROP COLUMN monitor; PRAGMA user_version=2');db.close();
    store=new IndexStore(path);expect(store.recordBoot().schemaVersion).toBe(3);expect(store.world(world.id).view?.theme).toBe('dusk');expect(store.entry(world.id,world.rootId).bytes).toBe('0');
  }finally{store.close();if(!within(artifacts,base))throw Error('Unsafe fixture cleanup');await rm(base,{recursive:true,force:true});}
});

it('activity decays, rejects future dates and downweights build paths without changing bytes',()=>{
 const now=Date.now();expect(activityScore(new Date(now).toISOString(),'src/a.ts',now)).toBe(1);
 expect(activityScore(new Date(now).toISOString(),'node_modules/a.js',now)).toBe(.2);
 expect(activityScore(new Date(now-86400000).toISOString(),'a',now)).toBe(0);
 expect(activityScore(new Date(now+1000).toISOString(),'a',now)).toBe(0);
});

it('collapses a burst, repairs missed events and retains an offline root until it returns',async()=>{
 const artifacts=resolve('.artifacts');await mkdir(artifacts,{recursive:true});const base=await mkdtemp(join(artifacts,'watch-recovery-'));const root=join(base,'source');await mkdir(root);
 const store=new IndexStore(join(base,'index.sqlite')),scanner=new Scanner(store),monitor=new ChangeMonitor(store,scanner,25,200);
 try {
  await mkdir(join(root,'.git'));await writeFile(join(root,'keep.txt'),'keep');
  const world=await scanner.create(root);await scanner.control(world.id,'start');await until(()=>!scanner.busy);expect(store.entry(world.id,world.rootId).repository).toBe(true);
  monitor.enable(world.id);await until(()=>store.world(world.id).monitor==='watching');
  for(let i=0;i<150;i++){await writeFile(join(root,`批量_${i}.txt`),'x');monitor.invalidate('unknown-'+i);}
  monitor.invalidate();await until(()=>store.entry(world.id,world.rootId).fileCount===151&&!scanner.busy);
  await rename(root,join(base,'offline'));monitor.invalidate();await until(()=>store.world(world.id).state==='unavailable');expect(store.entry(world.id,world.rootId).fileCount).toBe(151);
  await rename(join(base,'offline'),root);await until(()=>store.world(world.id).state==='complete'&&!scanner.busy);expect(store.entry(world.id,world.rootId).fileCount).toBe(151);
 } finally {await monitor.stop();store.close();if(!within(artifacts,base))throw Error('Unsafe cleanup');await rm(base,{recursive:true,force:true});}
},20000);

it('keeps the watcher budget bounded across fallback and re-enable cycles',async()=>{
 const artifacts=resolve('.artifacts');await mkdir(artifacts,{recursive:true});const base=await mkdtemp(join(artifacts,'watch-budget-'));const root=join(base,'source');await mkdir(root);
 const store=new IndexStore(join(base,'index.sqlite')),scanner=new Scanner(store),monitor=new ChangeMonitor(store,scanner,20,60000);
 try {
  for(let i=0;i<270;i++)await mkdir(join(root,`目录_${i}`));
  const world=await scanner.create(root);await scanner.control(world.id,'start');await until(()=>!scanner.busy);
  monitor.enable(world.id);await until(()=>store.world(world.id).monitor==='fallback');
  for(let cycle=0;cycle<12;cycle++) {
   await writeFile(join(root,`持续变更_${cycle}.txt`),'x');monitor.invalidate();
   await until(()=>store.entry(world.id,world.rootId).fileCount===cycle+1&&!scanner.busy&&store.world(world.id).state==='complete');
   expect(store.world(world.id).monitor).toBe('fallback');
   monitor.disable(world.id);expect(store.world(world.id).monitor).toBe('stopped');
   monitor.enable(world.id);await until(()=>store.world(world.id).monitor==='fallback');
  }
 } finally {await monitor.stop();store.close();if(!within(artifacts,base))throw Error('Unsafe cleanup');await rm(base,{recursive:true,force:true});}
},90000);
