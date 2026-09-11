import { exerciseCatalog } from './catalog-smoke';
import { registerCatalog } from './catalog-ipc';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BackendHost } from './backend-host';
import { isTrustedRendererUrl } from './trusted-renderer';
import { exerciseCity } from './city-smoke';
import { benchmark } from './benchmark';
import { captureSmoke } from './capture-smoke';
import { HEALTH_CHANNEL, isEmptyRequest, type HealthResult } from '../shared/contracts/desktop';

const qaDirectory = process.argv.find(arg => arg.startsWith('--qa-root='))?.slice('--qa-root='.length);
const benchmarkDirectory = process.argv.find(arg => arg.startsWith('--benchmark-root='))?.slice('--benchmark-root='.length);
const isolatedDirectory = qaDirectory ?? benchmarkDirectory;
if (isolatedDirectory) {
  if (!isAbsolute(isolatedDirectory)) throw new Error('INVALID_BENCHMARK_ROOT');
  mkdirSync(isolatedDirectory, { recursive: true });
  app.setPath('userData', join(isolatedDirectory, 'profile'));
  app.setPath('sessionData', join(isolatedDirectory, 'session'));
}
const smokeDirectory = process.argv.find((arg) => arg.startsWith('--smoke-root='))?.slice('--smoke-root='.length);
if (smokeDirectory) {
  // Deterministic software rendering for hidden CI screenshots only.
  // Ordinary desktop windows keep hardware acceleration enabled.
  app.disableHardwareAcceleration();
  if (!isAbsolute(smokeDirectory)) throw new Error('SMOKE_ROOT_MUST_BE_ABSOLUTE');
  mkdirSync(smokeDirectory, { recursive: true });
  app.setPath('userData', join(smokeDirectory, 'profile'));
  app.setPath('sessionData', join(smokeDirectory, 'session'));
}

const backend = new BackendHost();
let window: BrowserWindow | undefined;
let shuttingDown = false;
const rendererFile = join(__dirname, '../renderer/index.html');
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererUrl = devUrl ?? pathToFileURL(rendererFile).href;

function registerHealth(): void {
  ipcMain.handle(HEALTH_CHANNEL, (event, ...args: unknown[]): HealthResult => {
    const source = event.senderFrame;
    if (!window || event.sender !== window.webContents || !source || source !== event.sender.mainFrame ||
        !isTrustedRendererUrl(source.url, rendererUrl) || !isEmptyRequest(args)) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: '请求无效。', retryable: false } };
    }
    const health = backend.getHealth();
    return health
      ? { ok: true, data: health, revision: 1 }
      : { ok: false, error: { code: 'UNAVAILABLE', message: '本地索引暂不可用，请重新启动应用。', retryable: true } };
  });
}

async function createWindow(): Promise<BrowserWindow> {
  const result = new BrowserWindow({
    width: 1200, height: 800, minWidth: 880, minHeight: 640,
    show: !smokeDirectory, backgroundColor: '#f7f3eb', title: '电脑世界探索器', autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false,
      offscreen: Boolean(smokeDirectory), backgroundThrottling: !smokeDirectory
    }
  });
  window = result;
  result.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  result.webContents.on('will-navigate', (event) => event.preventDefault());
  result.webContents.on('will-attach-webview', (event) => event.preventDefault());
  if (devUrl) await result.loadURL(devUrl);
  else await result.loadFile(rendererFile);
  return result;
}

async function runSmoke(result: BrowserWindow): Promise<void> {
  await captureSmoke(result.webContents, join(smokeDirectory!, 'home.png'));
  const evidence = await result.webContents.executeJavaScript(`(async () => {
    document.querySelector('[data-demo]')?.click();
    await new Promise(r=>setTimeout(r,100));
    const health = await window.byteAtlas.getHealth();
    const invalid = await window.byteAtlas.getHealth({ path: 'forbidden' });
    const isolation = { require: typeof window.require, process: typeof window.process, exposed: Object.keys(window.byteAtlas) };
    for (let i = 0; i < 100 && document.querySelector('[data-status]')?.getAttribute('data-status') !== 'ready'; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return { health, invalid, isolation, runtime: window.byteAtlas.getRuntimeInfo(), uiReady: document.querySelector('[data-status]')?.getAttribute('data-status') === 'ready' };
  })()`);
  const cityEvidence = await exerciseCity(result.webContents);
  const preferences = { ...evidence.runtime, nodeIntegration: evidence.isolation.require !== 'undefined' };
  const backendExitCode = 0;
  const report = {
    ...evidence, city: cityEvidence, backendExitCode, packaged: app.isPackaged, screenshotMode: 'software-offscreen',
    versions: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome },
    security: { contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration }
  };
  writeFileSync(join(smokeDirectory!, 'report.json'), JSON.stringify(report, null, 2));
  await captureSmoke(result.webContents, join(smokeDirectory!, 'window.png'));
  for (const [directory, filename] of [['04-archive', 'large-files.png'], ['05-assets', 'groups.png']]) {
    await result.webContents.executeJavaScript(`(async () => {
      [...document.querySelectorAll('.pathbar button')].find(e=>e.textContent==='我的工作空间').click();
      await new Promise(r=>setTimeout(r,350));
      document.querySelector('[data-enter="${directory}"]').click();
      await new Promise(r=>setTimeout(r,350));
      document.querySelector('[data-select]').click();
      document.querySelector('[data-action="fit"]').click();
      await new Promise(r=>setTimeout(r,100));
    })()`);
    await captureSmoke(result.webContents, join(smokeDirectory!, filename!));
  }
  await result.webContents.executeJavaScript(`(async () => {
    document.querySelector('[data-reveal]').click();
    await new Promise(r=>setTimeout(r,200));
  })()`);
  await captureSmoke(result.webContents, join(smokeDirectory!, 'revealed.png'));
  const catalogEvidence = await exerciseCatalog(result.webContents, backend, smokeDirectory!);
  const actualExit = await backend.stop();
  writeFileSync(join(smokeDirectory!, 'report.json'), JSON.stringify({...report, catalog:catalogEvidence, backendExitCode:actualExit},null,2));
  const passed = actualExit === 0 && evidence.health?.ok && evidence.uiReady && evidence.invalid?.error?.code === 'BAD_REQUEST' &&
    evidence.isolation.require === 'undefined' && evidence.isolation.process === 'undefined' &&
    evidence.isolation.exposed.join(',') === 'catalog,getHealth,getRuntimeInfo' && backendExitCode === 0 &&
    preferences.contextIsolation && preferences.sandbox && !preferences.nodeIntegration;
  shuttingDown = true;
  app.exit(passed ? 0 : 1);
}

app.on('before-quit', (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void backend.stop().finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());

void app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  try { await backend.start(join(__dirname, 'backend.js'), join(app.getPath('userData'), 'index')); }
  catch { console.error('ByteAtlas backend unavailable; source files have not been scanned.'); }
  registerHealth();
  registerCatalog(backend, () => window, rendererUrl);
  const result = await createWindow();
  if (qaDirectory) { result.show(); result.focus(); }
  if (smokeDirectory) await runSmoke(result);
  if (benchmarkDirectory) { await benchmark(result, benchmarkDirectory); await backend.stop(); shuttingDown = true; app.exit(0); }
}).catch(async (error: unknown) => {
  await backend.stop();
  if (smokeDirectory || benchmarkDirectory || qaDirectory) writeFileSync(join((smokeDirectory ?? benchmarkDirectory ?? qaDirectory)!, 'error.txt'), error instanceof Error ? error.stack ?? error.message : String(error));
  shuttingDown = true;
  app.exit(1);
});
