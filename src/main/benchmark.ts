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
    try {
        const data = await window.webContents.executeJavaScript(`(async () => {
      const wait = async (fn) => { for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Benchmark timeout'); };
      document.querySelector('[data-demo]')?.click();
      const host=()=>document.querySelector('.canvas-host');
      await wait(()=>host()?.dataset.sceneState==='ready');
      const firstSceneMs=performance.now();
      const intervals=[]; let previous=performance.now();
      for(let i=0;i<180;i++) { document.querySelector(i%2?'[aria-label="缩小"]':'[aria-label="放大"]').click(); await new Promise(requestAnimationFrame); const now=performance.now(); intervals.push(now-previous); previous=now; }
      intervals.sort((a,b)=>a-b);
      const canvas=host().querySelector('canvas'), gl=canvas.getContext('webgl2');
      const gpu=gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):'unavailable';
      const extension=gl.getExtension('WEBGL_lose_context'); if(!extension)throw Error('Cannot inject context loss');
      extension.loseContext(); await wait(()=>host().dataset.sceneState==='lost');
      document.querySelector('[data-enter="06-empty"]').click();
      await wait(()=>document.querySelector('.app').dataset.directory==='06-empty');
      extension.restoreContext(); await wait(()=>host().dataset.sceneState==='ready');
      document.querySelector('[data-action="back"]').click(); await new Promise(r=>setTimeout(r,400));
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)};
      // Use the recovery button after a second loss to exercise actual constructor failure.
      extension.loseContext(); await wait(()=>document.querySelector('.graphics-error button'));
      document.querySelector('.graphics-error button').click(); await wait(()=>host().dataset.sceneState==='error');
      HTMLCanvasElement.prototype.getContext=original;
      document.querySelector('[data-enter="06-empty"]').click(); await wait(()=>document.querySelector('.app').dataset.directory==='06-empty');
      document.querySelector('.graphics-error button').click(); await wait(()=>host().dataset.sceneState==='ready');
      document.querySelector('[data-action="back"]').click(); await new Promise(r=>setTimeout(r,400));
      return {firstSceneMs, frameIntervalP50:intervals[90],frameIntervalP95:intervals[171],frameIntervalMax:intervals[179],renderer,
        scene:{width:host().clientWidth,height:host().clientHeight,drawCalls:host().dataset.drawCalls,triangles:host().dataset.triangles},
        faults:['real context loss and restore','constructor failure','list navigation during both faults','reload recovery']};
    })()`);
        sample();
        writeFileSync(join(directory, 'benchmark.json'), JSON.stringify({ ...data, peakWorkingSetKB, gpu: app.getGPUFeatureStatus(), cpu: cpus()[0]?.model, memoryBytes: totalmem(), windows: release(), sample: '111 fictitious files, 10 directories; 180 alternating zoom frames; fresh app cache, OS cache uncontrolled', memorySamplingMs: 50 }, null, 2));
        const png = await window.webContents.capturePage();
        writeFileSync(join(directory, 'benchmark.png'), png.toPNG());
    }
    finally {
        clearInterval(timer);
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
      return {firstSceneMs,frameIntervalP50:intervals[90],frameIntervalP95:intervals[171],frameIntervalMax:intervals[179],scene:{width:host.clientWidth,height:host.clientHeight,drawCalls:host.dataset.drawCalls,triangles:host.dataset.triangles}};
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
