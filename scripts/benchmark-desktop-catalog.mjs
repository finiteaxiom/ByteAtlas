import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

const require=createRequire(import.meta.url);
const artifacts=resolve('.artifacts');
await mkdir(artifacts,{recursive:true});
const root=await mkdtemp(join(artifacts,'desktop-catalog-'));
const source=join(root,'fixture');
await mkdir(source);
for(let directory=0;directory<100;directory++) {
  const path=join(source,`目录_${String(directory).padStart(3,'0')}`);
  await mkdir(path);
  for(let batch=0;batch<100;batch+=25) await Promise.all(Array.from({length:25},(_,index)=>writeFile(join(path,`文件_${String(directory*100+batch+index).padStart(5,'0')}.txt`),'')));
}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),['.',`--desktop-catalog-benchmark-root=${root}`],{windowsHide:true,stdio:'inherit',env});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',value=>resolve(value??1));});
if(code!==0){
  let detail='';try{detail=await readFile(join(root,'error.txt'),'utf8');}catch{}
  throw Error(`Desktop catalog benchmark exited with ${code}. ${detail} Evidence: ${root}`);
}
console.log(await readFile(join(root,'desktop-catalog-benchmark.json'),'utf8'));
console.log('Evidence:',root);
