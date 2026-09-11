import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const child=spawn(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','tests/catalog-load.test.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,BYTEATLAS_LOAD:'1'}});
child.on('exit',code=>process.exit(code??1));
