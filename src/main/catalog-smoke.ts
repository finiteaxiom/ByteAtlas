import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ClipboardItem, clipboard, type WebContents } from 'electron';
import type { BackendHost } from './backend-host';
import type { World } from '../shared/contracts/catalog';
import { captureSmoke } from './capture-smoke';
export async function exerciseCatalog(contents: WebContents, backend: BackendHost, directory: string): Promise<unknown> {
    const root = join(directory, 'fixture');
    await mkdir(join(root, '中文 空格 & $'), { recursive: true });
    await mkdir(join(root, '素材仓库'), { recursive: true });
    await mkdir(join(root, '空目录'), { recursive: true });
    await writeFile(join(root, '中文 空格 & $', '单.txt'), 'ByteAtlas fixture');
    for (let i = 0; i < 96; i++)
        await writeFile(join(root, '素材仓库', `贴图_${i}.png`), 'fixture');
    const world = await backend.call({ action: 'createTrusted', path: root }) as World;
    const beforeView = world.view;
    await backend.call({ action: 'scan', requestId: 'smoke-start', worldId: world.id, command: 'start' });
    const clipboardBefore = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
    try {
        const result = await contents.executeJavaScript(`(async()=>{
  const wait=async(fn)=>{for(let i=0;i<300;i++){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Real catalog timeout: '+fn.toString());};
  const click=(selector)=>{const node=document.querySelector(selector);if(!node)throw Error('Missing UI target: '+selector);node.click();};
  let seq=0;const call=async(r)=>{const result=await window.byteAtlas.catalog({...r,requestId:'smoke-ui-'+(++seq)});if(!result.ok)throw Error(result.error.message);return result.data;};
  const id=${JSON.stringify(world.id)};
  const invalid=await window.byteAtlas.catalog({action:'createTrusted',path:'forbidden',requestId:'invalid'});if(invalid.ok||invalid.error.code!=='BAD_REQUEST')throw Error('Unsafe catalog accepted');
  await wait(async()=> (await call({action:'worlds'})).find(w=>w.id===id).state==='complete');
  click('.leave-demo');await wait(()=>document.querySelector('[data-world="'+id+'"]'));click('[data-world="'+id+'"]');
  await wait(()=>document.querySelector('[data-real-world]')&&document.querySelector('canvas'));
  const search=await call({action:'search',worldId:id,query:'单.txt',cursor:null});if(search.entries.length!==1)throw Error('Chinese lookup mismatch');
  const target=search.entries[0];const resolved=await call({action:'resolve',worldId:id,entryId:target.id});
  const scene=await call({action:'scene',worldId:id,directoryId:resolved.directoryId,page:resolved.page,selectedId:target.id});if(scene.selected.bytes!=='17')throw Error('Wrong byte count');
  const wrong=await window.byteAtlas.catalog({action:'resolve',worldId:'wrong-world',entryId:target.id,requestId:'bad-world'});if(wrong.ok)throw Error('Cross-world ID accepted');
  const input=document.querySelector('[aria-label="搜索真实文件"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'贴图_1');input.dispatchEvent(new Event('input',{bubbles:true}));
  await wait(()=>document.querySelector('[data-search-result]'));click('[data-search-result]');
  await wait(()=>document.querySelector('[data-real-world]').dataset.selected&&document.querySelector('[data-real-world]').dataset.directory!==${JSON.stringify(world.rootId)});
  await wait(()=>document.querySelector('.canvas-host').dataset.sceneState==='ready');
  await new Promise(r=>setTimeout(r,1200));
  const current=(await call({action:'worlds'})).find(w=>w.id===id);if(!current.view?.selectedId||current.view.page!==0)throw Error('View not persisted');
  const revealScene=await call({action:'scene',worldId:id,directoryId:current.view.directoryId,page:0,selectedId:current.view.selectedId});if(!revealScene.objects.some(o=>o.members.includes(current.view.selectedId)))throw Error('Aggregate reveal missing');
  await call({action:'system',worldId:id,entryId:target.id,operation:'copy'});
  return {passed:true,worldId:id,view:current.view,rootId:current.rootId,checks:['real SQLite scan','Chinese special paths','exact bytes','invalid and cross-world requests','renderer search to aggregate reveal','persisted view','copy path']};
 })()`);
        if (!(await clipboard.readText()).endsWith('单.txt'))
            throw Error('System copy did not write resolved path');
        await captureSmoke(contents, join(directory, 'real-world.png'));
        await contents.executeJavaScript(`document.querySelectorAll('.top-mode-switch button')[2].click()`);
        await new Promise(r=>setTimeout(r,250));
        await captureSmoke(contents, join(directory,'activity.png'));
        if (beforeView && !beforeView.selectedId)
            throw Error('Restart view lost selection');
        return { ...result, reopenedSavedView: Boolean(beforeView) };
    }
    finally {
        if ((await clipboard.readText()).startsWith(root))
            await clipboard.write(clipboardBefore);
    }
}

