import { app, type BrowserWindow } from 'electron';
import { cpus, totalmem, release } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
