import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const installed = process.argv.find(arg=>arg.startsWith('--installed='))?.slice('--installed='.length);
const packaged = process.argv.includes('--packaged') || Boolean(installed);
const devServer = process.argv.includes('--dev-server');
const dataRoot = process.argv.find(arg=>arg.startsWith('--data-root='))?.slice('--data-root='.length);
assert.ok(!(packaged && devServer), 'Choose packaged or dev-server mode');
const executable = installed ? resolve(installed) : devServer ? process.execPath : packaged ? resolve('dist/win-unpacked/ByteAtlas.exe') : require('electron');
const artifactRoot = resolve('.artifacts');
await mkdir(artifactRoot, { recursive: true });
const directory = dataRoot ? resolve(dataRoot) : await mkdtemp(join(artifactRoot, devServer ? 'dev-server-' : packaged ? 'packaged-' : 'development-'));
await mkdir(directory, { recursive: true });

async function runOnce(recover = false) {
  const prefix = devServer
    ? [join(dirname(require.resolve('electron-vite/package.json')), 'bin/electron-vite.js'), 'dev', '--', `--smoke-root=${directory}`, ...(recover ? ['--smoke-recover'] : [])]
    : [...(packaged ? [] : ['.']), `--smoke-root=${directory}`, ...(recover ? ['--smoke-recover'] : [])];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolveRun, reject) => {
    const child = spawn(executable, prefix, { windowsHide: true, stdio: 'inherit', env });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Smoke timed out after 45 seconds'));
    }, 45000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun();
      else reject(new Error(`Smoke exited with ${code}; evidence: ${directory}`));
    });
  });
  const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
  const png = await readFile(join(directory, 'window.png'));
  assert.ok(png.length > 1000, 'Screenshot must contain an actual rendered frame');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(report.packaged, packaged);
  assert.equal(report.health.ok, true);
  assert.equal(report.health.data.integrity, 'ok');
  assert.equal(report.backendExitCode, 0);
  assert.equal(report.uiReady, true);
  assert.equal(report.city.passed, true);
  assert.equal(report.catalog.passed, true);
  assert.deepEqual(report.security, { contextIsolation: true, sandbox: true, nodeIntegration: false });
  assert.equal(report.invalid.error.code, 'BAD_REQUEST');
  assert.deepEqual(report.isolation, { require: 'undefined', process: 'undefined', exposed: ['catalog', 'getHealth', 'getRuntimeInfo'] });
  return report;
}

const first = await runOnce();
const second = await runOnce(true);
assert.equal(second.health.data.bootCount, first.health.data.bootCount + 1);
if (!dataRoot) assert.equal(first.health.data.bootCount, 1);
assert.equal(second.catalog.reopenedSavedView, true);
assert.equal(second.recovered, true);
console.log(JSON.stringify({ passed: true, packaged, devServer, persistedBootCounts: [1, 2], evidence: directory, versions: second.versions }, null, 2));
