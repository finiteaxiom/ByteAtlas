import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({fork:vi.fn()}));
vi.mock('electron',()=>({utilityProcess:{fork:mocks.fork}}));
import { BackendHost } from '../src/main/backend-host';

it('coalesces recovery, bounds waiting callers and never restarts after shutdown',async()=>{
 const children:EventEmitter[]=[];
 mocks.fork.mockImplementation(()=>{
  const child=Object.assign(new EventEmitter(),{pid:1,kill:()=>child.emit('exit',1),postMessage:(message:{type:string;id:number})=>{
   queueMicrotask(()=>message.type==='shutdown'?child.emit('exit',0):child.emit('message',{type:'reply',id:message.id,data:[]}));
  }});children.push(child);return child;
 });
 const ready={type:'ready',health:{schemaVersion:3,sqliteVersion:'test',bootCount:1,integrity:'ok'}};
 const host=new BackendHost();const start=host.start('backend.js','test-data');children[0]!.emit('message',ready);await start;
 children[0]!.emit('exit',1);
 const requests=Array.from({length:32},()=>host.call({action:'worlds'}));
 await expect(host.call({action:'worlds'})).rejects.toThrow('BUSY');expect(children).toHaveLength(2);
 children[1]!.emit('message',ready);await Promise.all(requests);
 expect(await host.stop()).toBe(0);await expect(host.call({action:'worlds'})).rejects.toThrow('UNAVAILABLE');expect(children).toHaveLength(2);
});
