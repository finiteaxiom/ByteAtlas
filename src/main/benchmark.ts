import { app, type BrowserWindow } from 'electron';
import { cpus, totalmem, release } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { BackendHost } from './backend-host';
import type { World } from '../shared/contracts/catalog';
export async function benchmark(window: BrowserWindow, directory: string): Promise<void> {
    let peakWorkingSetKB = 0;
    const sample = (): void => { peakWorkingSetKB = Math.max(peakWorkingSetKB, app.getAppMetrics().reduce((n, p) => n + p.memory.workingSetSize, 0)); };
    const timer = setInterval(sample, 50);
    const progress = setInterval(() => {
        void window.webContents.executeJavaScript(`document.querySelector('.canvas-host')?.dataset.benchmarkStage ?? 'renderer-unavailable'`)
            .then(stage => writeFileSync(join(directory, 'benchmark-progress.json'), JSON.stringify({ stage, at: new Date().toISOString() }, null, 2)))
            .catch(() => undefined);
    }, 500);
    try {
        const data = await window.webContents.executeJavaScript(`(async () => {
      let stage='start'; const mark=value=>{stage=value;const host=document.querySelector('.canvas-host');if(host)host.dataset.benchmarkStage=value;};
      try {
      const wait = async (fn) => { for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Benchmark timeout'); };
      mark('open-demo');
      document.querySelector('[data-demo]')?.click();
      const host=()=>document.querySelector('.canvas-host');
      await wait(()=>host()?.dataset.sceneState==='ready');
      mark('zoom-frames');
      const firstSceneMs=performance.now();
      const sampleFrames=async(count)=>{const intervals=[];let previous=performance.now();for(let i=0;i<count;i++){document.querySelector(i%2?'[aria-label="缩小"]':'[aria-label="放大"]').click();await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-previous);previous=now;}intervals.sort((a,b)=>a-b);return {p50:intervals[Math.floor(count*.5)],p95:intervals[Math.floor(count*.95)],max:intervals[count-1]};};
      const motionOn=await sampleFrames(180);
      const motionHost=host();const environment={enabled:motionHost.dataset.environmentMotion==='true',treeCount:Number(motionHost.dataset.treeCount)};
      document.querySelector('[data-action="motion"]')?.click();await new Promise(r=>setTimeout(r,80));
      const motionOff=await sampleFrames(180);
      document.querySelector('[data-action="motion"]')?.click();await new Promise(r=>setTimeout(r,80));
      mark('read-renderer');
      const canvas=host().querySelector('canvas'), gl=canvas.getContext('webgl2');
      const gpu=gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):'unavailable';
      let extension=gl.getExtension('WEBGL_lose_context'); if(!extension)throw Error('Cannot inject context loss');
      mark('first-context-loss');
      extension.loseContext(); await wait(()=>host().dataset.sceneState==='lost');
      mark('navigate-during-loss');
      document.querySelector('[data-enter="06-empty"]').click();
      await wait(()=>document.querySelector('.app').dataset.directory==='06-empty');
      mark('first-context-restore');
      extension.restoreContext(); await wait(()=>host().dataset.sceneState==='ready');
      // The renderer may replace its canvas after restoration. Reacquire the
      // active context rather than using an extension from a detached canvas.
      const restoredCanvas=host().querySelector('canvas'), restoredGl=restoredCanvas?.getContext('webgl2');
      extension=restoredGl?.getExtension('WEBGL_lose_context'); if(!extension)throw Error('Cannot reacquire restored context');
      mark('return-after-restore');
      document.querySelector('[data-action="back"]').click(); await new Promise(r=>setTimeout(r,400));
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)};
      // Use the recovery button after a second loss to exercise actual constructor failure.
      mark('second-context-loss');
      extension.loseContext(); await wait(()=>document.querySelector('.graphics-error button'));
      mark('constructor-failure');
      document.querySelector('.graphics-error button').click(); await wait(()=>host().dataset.sceneState==='error');
      HTMLCanvasElement.prototype.getContext=original;
      mark('navigate-during-error');
      document.querySelector('[data-enter="06-empty"]').click(); await wait(()=>document.querySelector('.app').dataset.directory==='06-empty');
      mark('reload-recovery');
      document.querySelector('.graphics-error button').click(); await wait(()=>host().dataset.sceneState==='ready');
      mark('final-return');
      document.querySelector('[data-action="back"]').click(); await new Promise(r=>setTimeout(r,400));
      mark('complete');
      return {firstSceneMs, frameIntervalP50:motionOn.p50,frameIntervalP95:motionOn.p95,frameIntervalMax:motionOn.max,environment:{...environment,motionOn,motionOff,targetFps:30},renderer,
        scene:{width:host().clientWidth,height:host().clientHeight,drawCalls:host().dataset.drawCalls,triangles:host().dataset.triangles,visibleObjects:host().dataset.visibleObjects,textureCount:host().dataset.textureCount,textureBytes:host().dataset.textureBytes},
        faults:['real context loss and restore','constructor failure','list navigation during both faults','reload recovery']};
      } catch (error) { throw Error(\`Benchmark stage \${stage}: \${error instanceof Error ? error.message : String(error)}\`); }
    })()`);
        sample();
        writeFileSync(join(directory, 'benchmark-progress.json'), JSON.stringify({ stage: 'complete', at: new Date().toISOString() }, null, 2));
        writeFileSync(join(directory, 'benchmark.json'), JSON.stringify({ ...data, peakWorkingSetKB, gpu: app.getGPUFeatureStatus(), cpu: cpus()[0]?.model, memoryBytes: totalmem(), windows: release(), sample: '113 fictitious files, 10 directories; 180 alternating zoom frames with environment motion on and off; fresh app cache, OS cache uncontrolled', memorySamplingMs: 50 }, null, 2));
        const png = await window.webContents.capturePage();
        writeFileSync(join(directory, 'benchmark.png'), png.toPNG());
    }
    finally {
        clearInterval(timer);
        clearInterval(progress);
    }
}

// This uses an explicitly created fixture and measures the complete Electron
// process set. It is separate from the small visual-demo benchmark.
export async function benchmarkDesktopCatalog(window: BrowserWindow, backend: BackendHost, directory: string): Promise<void> {
    const source = join(directory, 'fixture');
    await mkdir(source, { recursive: true });
    const world = await backend.call({ action: 'createTrusted', path: source }) as World;
    let peakWorkingSetKB = 0;
    const sample = (): void => { peakWorkingSetKB = Math.max(peakWorkingSetKB, app.getAppMetrics().reduce((n, p) => n + p.memory.workingSetSize, 0)); };
    const timer = setInterval(sample, 50);
    try {
        const started = performance.now();
        await backend.call({ action: 'scan', worldId: world.id, command: 'start', requestId: 'desktop-benchmark-start' });
        let complete: World | undefined;
        for (let i = 0; i < 1200; i++) {
            const worlds = await backend.call({ action: 'worlds', requestId: `desktop-benchmark-worlds-${i}` }) as World[];
            complete = worlds.find(item => item.id === world.id);
            if (complete?.state === 'complete') break;
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (complete?.state !== 'complete') throw Error('Desktop catalog scan timeout');
        const scanMs = performance.now() - started;
        const rendered = await window.webContents.executeJavaScript(`(async()=>{
      const wait=async(fn)=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Desktop catalog renderer timeout');};
      const id=${JSON.stringify(world.id)};await wait(()=>document.querySelector('[data-world="'+id+'"]'));
      document.querySelector('[data-world="'+id+'"]').click();await wait(()=>document.querySelector('[data-real-world="'+id+'"]')&&document.querySelector('.canvas-host')?.dataset.sceneState==='ready');
      const firstSceneMs=performance.now();const intervals=[];let previous=performance.now();
      for(let i=0;i<180;i++){document.querySelector(i%2?'[aria-label="缩小"]':'[aria-label="放大"]').click();await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-previous);previous=now;}
      intervals.sort((a,b)=>a-b);const host=document.querySelector('.canvas-host');
      return {firstSceneMs,frameIntervalP50:intervals[90],frameIntervalP95:intervals[171],frameIntervalMax:intervals[179],scene:{width:host.clientWidth,height:host.clientHeight,drawCalls:host.dataset.drawCalls,triangles:host.dataset.triangles,visibleObjects:host.dataset.visibleObjects,textureCount:host.dataset.textureCount,textureBytes:host.dataset.textureBytes}};
    })()`);
        sample();
        const root = await backend.call({ action: 'scene', worldId: world.id, directoryId: world.rootId, page: 1, selectedId: null, requestId: 'desktop-benchmark-scene' }) as { directory: { fileCount: number; directoryCount: number; }; objects: unknown[]; };
        const result = { ...rendered, scanMs, peakWorkingSetKB, entries: root.directory.fileCount + root.directory.directoryCount, visibleObjects: root.objects.length, sample: '10,000 empty files in 100 directories; fresh fixture and profile; hardware rendering; OS cache uncontrolled', memorySamplingMs: 50 };
        writeFileSync(join(directory, 'desktop-catalog-benchmark.json'), JSON.stringify(result, null, 2));
        const png = await window.webContents.capturePage();
        await writeFile(join(directory, 'desktop-catalog-benchmark.png'), png.toPNG());
    }
    finally {
        clearInterval(timer);
    }
}
