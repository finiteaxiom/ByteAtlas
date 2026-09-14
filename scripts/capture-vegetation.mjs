import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const artifacts = resolve('.artifacts');
await mkdir(artifacts, { recursive: true });
const root = await mkdtemp(join(artifacts, 'vegetation-capture-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), ['.', `--vegetation-capture-root=${root}`], { windowsHide: true, stdio: 'inherit', env });
const code = await new Promise((resolveRun, reject) => { child.once('error', reject); child.once('exit', value => resolveRun(value ?? 1)); });
if (code !== 0) {
  let detail = '';
  try { detail = await readFile(join(root, 'error.txt'), 'utf8'); } catch { /* Artifact still identifies the failed run. */ }
  throw Error(`Vegetation capture exited with ${code}. ${detail} Evidence: ${root}`);
}
console.log(await readFile(join(root, 'vegetation-capture.json'), 'utf8'));
console.log('Evidence:', root);
