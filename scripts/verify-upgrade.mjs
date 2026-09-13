import { spawn, spawnSync } from 'node:child_process';
import { access, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { snapshotCatalogDatabase } from './catalog-snapshot.mjs';

const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const previous = argument('previous');
const current = argument('current');
assert.ok(previous && current, 'Pass --previous=PATH and --current=PATH');
const artifacts = resolve('.artifacts');
await mkdir(artifacts, { recursive: true });
const root = await mkdtemp(join(artifacts, 'upgrade-'));
const install = join(root, 'installed');
const profile = join(root, 'profile');
const executable = join(install, 'ByteAtlas.exe');
const uninstaller = join(install, 'Uninstall ByteAtlas.exe');
const database = join(profile, 'profile', 'index', 'index.sqlite');
const report = { root, install, profile, phases: [], cleanup: undefined };
let verificationCompleted = false;

async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
async function saveReport() { await writeFile(join(root, 'upgrade-report.json'), JSON.stringify(report, null, 2)); }
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
  await run(resolve(previous), ['/currentuser', '/S', `/D=${install}`]);
  report.phases.push({ name: 'previous-install', app: await exists(executable), uninstaller: await exists(uninstaller), registry: registryContainsInstall() });
  await saveReport();
  assert.equal(await exists(executable), true, 'Older installer did not create the application executable');
  assert.equal(await exists(uninstaller), true, 'Older installer did not create the uninstaller');
  assert.equal(registryContainsInstall(), true, 'Older installer did not create its current-user uninstall registration');
  await run(process.execPath, ['scripts/smoke.mjs', `--installed=${executable}`, `--data-root=${profile}`]);
  await copyFile(join(profile, 'report.json'), join(root, 'before-upgrade-report.json'));
  const before = JSON.parse(await readFile(join(profile, 'report.json'), 'utf8'));
  const baselineWorldId = before.catalog.worldId;
  const beforeSnapshot = snapshotCatalogDatabase(database, baselineWorldId);
  await writeFile(join(root, 'before-upgrade-snapshot.json'), JSON.stringify(beforeSnapshot, null, 2));

  await run(resolve(current), ['/currentuser', '/S', `/D=${install}`]);
  report.phases.push({ name: 'current-upgrade', app: await exists(executable), uninstaller: await exists(uninstaller), registry: registryContainsInstall() });
  await saveReport();
  assert.equal(await exists(executable), true, 'Current installer removed the application executable');
  assert.equal(registryContainsInstall(), true, 'Current installer removed the current-user uninstall registration');
  await run(executable, [`--migration-audit-root=${profile}`]);
  const migration = JSON.parse(await readFile(join(profile, 'migration-audit.json'), 'utf8'));
  const migratedSnapshot = snapshotCatalogDatabase(database, baselineWorldId);
  await writeFile(join(root, 'after-migration-snapshot.json'), JSON.stringify(migratedSnapshot, null, 2));
  assert.equal(migration.health?.schemaVersion, 3, 'Current packaged backend did not migrate to schema 3');
  assert.equal(migratedSnapshot.schemaVersion, 3, 'Database schema was not upgraded to schema 3');
  const { state: beforeState, ...stableBefore } = beforeSnapshot.world;
  const { state: migratedState, ...stableMigrated } = migratedSnapshot.world;
  assert.deepEqual({ ...migratedSnapshot, schemaVersion: beforeSnapshot.schemaVersion, world: stableMigrated }, { ...beforeSnapshot, world: stableBefore }, 'Migration changed baseline world, entries, exact bytes, layout slots or saved view before smoke');
  assert.equal(migratedState, 'interrupted', 'Interrupted scanning state was not disclosed after packaged backend restart');
  report.phases.push({ name: 'migration-audit', previousSchema: beforeSnapshot.schemaVersion, currentSchema: migratedSnapshot.schemaVersion, previousState: beforeState, currentState: migratedState, exactBytes: migratedSnapshot.exactBytes, entryCount: migratedSnapshot.entryCount });
  await saveReport();
  await run(process.execPath, ['scripts/smoke.mjs', `--installed=${executable}`, `--data-root=${profile}`]);
  const after = JSON.parse(await readFile(join(profile, 'report.json'), 'utf8'));
  assert.ok(after.health.data.bootCount > before.health.data.bootCount, 'New installer did not retain the application database');
  assert.equal(after.health.data.schemaVersion, 3);
  assert.equal(after.catalog.worldId, baselineWorldId, 'Current smoke did not reopen the baseline world after migration');
  assert.equal(after.catalog.reopenedSavedView, true, 'Upgrade lost the saved catalog view');
  await copyFile(join(profile, 'report.json'), join(root, 'after-upgrade-report.json'));
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
  await rm(join(profile, 'fixture'), { recursive: true, force: true });
  if (!cleanup.passed) throw Error(`Silent uninstall verification failed: ${cleanup.error ?? 'application, uninstaller or registration remained'}`);
}
