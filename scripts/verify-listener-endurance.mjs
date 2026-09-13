import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const value=(name, fallback)=>Number(process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3)??fallback);
const durationMs=value('duration-ms',86_400_000);
const sampleMs=value('sample-ms',300_000);
assert.ok(Number.isSafeInteger(durationMs)&&durationMs>=10_000,'duration-ms must be an integer of at least 10000');
assert.ok(Number.isSafeInteger(sampleMs)&&sampleMs>=1_000,'sample-ms must be an integer of at least 1000');
const artifacts=resolve('.artifacts');await mkdir(artifacts,{recursive:true});
const root=await mkdtemp(join(artifacts,'listener-endurance-run-'));
const run={startedAt:new Date().toISOString(),durationMs,sampleMs,root,phases:['filesystem endurance pending','packaged utility-process recovery pending']};
await writeFile(join(root,'run.json'),JSON.stringify(run,null,2));
const env={...process.env,BYTEATLAS_LISTENER_ENDURANCE:'1',BYTEATLAS_LISTENER_ENDURANCE_MS:String(durationMs),BYTEATLAS_LISTENER_SAMPLE_MS:String(sampleMs)};
const execute=(file,args,environment=env)=>new Promise((resolveRun,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'inherit',env:environment});child.once('error',reject);child.once('exit',code=>code===0?resolveRun():reject(Error(`${file} exited with ${code??-1}`)));});
try {
  await execute(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/listener-endurance.test.ts','--reporter=verbose']);
  run.phases[0]='filesystem endurance passed';await writeFile(join(root,'run.json'),JSON.stringify(run,null,2));
  // The existing smoke path explicitly kills only its own Utility Process on
  // launch two, then asserts recovered state.  Keep this outside the direct
  // filesystem test so it exercises the packaged Electron boundary.
  await execute(process.execPath,['scripts/smoke.mjs','--packaged'],{...process.env});
  run.phases[1]='packaged utility-process recovery passed';run.passed=true;run.finishedAt=new Date().toISOString();
  await writeFile(join(root,'run.json'),JSON.stringify(run,null,2));
  console.log(JSON.stringify(run,null,2));
} catch(error) {
  run.error=error instanceof Error?error.message:String(error);run.finishedAt=new Date().toISOString();await writeFile(join(root,'run.json'),JSON.stringify(run,null,2));throw error;
}
