import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const installerArgument = process.argv.find((value) => value.startsWith('--installer='))?.slice('--installer='.length);
assert.ok(installerArgument, 'Pass --installer=PATH');
const installer = resolve(installerArgument);
const artifacts = resolve('.artifacts');
await mkdir(artifacts, { recursive: true });
const root = await mkdtemp(join(artifacts, 'installation-'));
const install = join(root, 'installed');
const profile = join(root, 'profile');
const executable = join(install, 'ByteAtlas.exe');
const uninstaller = join(install, 'Uninstall ByteAtlas.exe');
const report = { root, install, profile, phases: [], cleanup: undefined };
let verificationCompleted = false;

async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
async function saveReport() { await writeFile(join(root, 'installation-report.json'), JSON.stringify(report, null, 2)); }
async function run(file, args) {
  const code = await new Promise((resolveRun, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolveRun(exitCode ?? -1));
  });
  if (code !== 0) throw new Error(`${file} exited with ${code}`);
}
function registryContainsInstall() {
  const result = spawnSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s'], { encoding: 'utf8', windowsHide: true });
  return `${result.stdout}\n${result.stderr}`.includes(install);
}
function hasExistingByteAtlasRegistration() {
  const result = spawnSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s'], { encoding: 'utf8', windowsHide: true });
  return /ByteAtlas|local\.byteatlas\.desktop/i.test(`${result.stdout}\n${result.stderr}`);
}
async function waitFor(expectedApp, expectedUninstaller, expectedRegistry, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (await exists(executable) === expectedApp && await exists(uninstaller) === expectedUninstaller && registryContainsInstall() === expectedRegistry) return Date.now() - started;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Timed out waiting for install state app=${expectedApp}, uninstaller=${expectedUninstaller}, registry=${expectedRegistry}`);
}

try {
  assert.equal(hasExistingByteAtlasRegistration(), false, 'Refusing to touch an existing user ByteAtlas registration');
  await run(installer, ['/currentuser', '/S', `/D=${install}`]);
  report.phases.push({ name: 'install', app: await exists(executable), uninstaller: await exists(uninstaller), registry: registryContainsInstall() });
  await saveReport();
  assert.equal(await exists(executable), true, 'Installer did not create the application executable');
  assert.equal(await exists(uninstaller), true, 'Installer did not create the uninstaller');
  assert.equal(registryContainsInstall(), true, 'Installer did not create its current-user uninstall registration');
  await run(process.execPath, ['scripts/smoke.mjs', `--installed=${executable}`, `--data-root=${profile}`]);
  report.phases.push({ name: 'smoke', passed: true });
  verificationCompleted = true;
  await saveReport();
} finally {
  const cleanup = { uninstallerPresent: await exists(uninstaller), profileRetained: await exists(profile) };
  if (cleanup.uninstallerPresent) {
    try {
      await run(uninstaller, ['/currentuser', '/S']);
      cleanup.waitMs = await waitFor(false, false, false);
      cleanup.passed = true;
    } catch (error) {
      cleanup.passed = false;
      cleanup.error = error instanceof Error ? error.message : String(error);
    }
  } else cleanup.passed = !await exists(executable) && !registryContainsInstall();
  report.cleanup = cleanup;
  report.passed = verificationCompleted && cleanup.passed === true;
  await saveReport();
  if (!cleanup.passed) throw Error(`Silent uninstall verification failed: ${cleanup.error ?? 'application, uninstaller or registration remained'}`);
}
