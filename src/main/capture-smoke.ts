import type { WebContents, NativeImage } from 'electron';
import { writeFileSync } from 'node:fs';

export async function captureSmoke(contents: WebContents, path: string): Promise<void> {
  await contents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))');
  const screenshot = await new Promise<NativeImage>((resolve, reject) => {
    const timer = setTimeout(() => { contents.removeListener('paint', onPaint); reject(new Error('OFFSCREEN_PAINT_TIMEOUT')); }, 5000);
    const onPaint = (_event: Electron.Event, _dirty: Electron.Rectangle, image: NativeImage): void => {
      if (image.isEmpty()) return;
      clearTimeout(timer); contents.removeListener('paint', onPaint); resolve(image);
    };
    contents.on('paint', onPaint); contents.invalidate();
  });
  writeFileSync(path, screenshot.toPNG());
}
