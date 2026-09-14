import { useEffect, useState } from 'react';
import type { World } from '../shared/contracts/catalog';
import { catalog } from './city/catalog-client';
import { RealWorld } from './RealWorld';
export function WorldHome({Demo}:{Demo:(props:{onExit:()=>void})=>React.JSX.Element}):React.JSX.Element {
 const [worlds,setWorlds]=useState<World[]>([]),[active,setActive]=useState<World>(),[demo,setDemo]=useState(false),[choice,setChoice]=useState<{token:string;path:string}>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=():void=>{void catalog<World[]>({action:'worlds'}).then(setWorlds).catch(e=>setError(e.message));};
 useEffect(()=>{refresh();},[]);
 async function enter(world:World):Promise<void>{setActive(world);if(!['running','paused'].includes(world.state))try{await catalog({action:'scan',worldId:world.id,command:'start'});}catch(e){setError((e as Error).message);}}
 if(active)return <RealWorld initial={active} onExit={()=>{setActive(undefined);refresh();}}/>;
 if(demo)return <Demo onExit={()=>{setDemo(false);refresh();}}/>;
 return <main className="world-home"><header className="brand"><span className="brand-mark">B</span><strong>ByteAtlas</strong><span>电脑世界探索器</span></header><div className="home-intro"><span className="eyebrow">A LITTLE WORLD OF YOUR OWN</span><h1>把你的文件夹，<br/>变成一座可以探索的城市。</h1><p>文件是建筑，目录是街区。发现大文件，沿着路径探索，<br/>从城市回到真实文件。</p><button className="primary" data-choose disabled={busy} onClick={()=>{setBusy(true);void catalog<{token:string;path:string}|null>({action:'choose'}).then(v=>setChoice(v??undefined)).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>选择文件夹，生成城市 ↗</button><button data-demo onClick={()=>setDemo(true)}>先探索样例城市</button></div>
 {choice&&<section className="root-confirm"><h2>准备探索</h2><p className="detail-path">{choice.path}</p><p>仅读取目录结构和元数据，索引保存在应用本地。不会读取正文、上传路径或修改源文件。</p><details><summary>扫描范围与统计说明</summary><p>不排除 node_modules、构建产物或 .git。应用自身数据目录若位于所选范围内，会明确排除且不计入统计，以避免索引自身。默认不递归跟随符号链接与目录联接点。逻辑大小可能重复计算硬链接，不等于磁盘占用。扫描可暂停、取消。</p></details><button className="primary" data-create disabled={busy} onClick={()=>{setBusy(true);void catalog<World>({action:'create',token:choice.token}).then(w=>{setChoice(undefined);return enter(w);}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>开始探索</button><button onClick={()=>setChoice(undefined)}>取消</button></section>}
 <section className="saved-worlds"><h2>我的世界 <small>{worlds.length}</small></h2>{!worlds.length&&<p>选择一个文件夹，从第一条街道开始。</p>}{worlds.map(w=><article key={w.id}><button data-world={w.id} onClick={()=>void enter(w)}><strong>{w.name}</strong><span>{w.rootPath}</span><small>{w.verifiedAt?`上次核对 ${new Date(w.verifiedAt).toLocaleString('zh-CN')}`:'尚未完成扫描'} · 打开后重新核对</small></button><button aria-label={`移除世界${w.name}`} onClick={()=>void catalog({action:'remove',worldId:w.id}).then(refresh).catch(e=>setError(e.message))}>移除入口与本地索引</button></article>)}</section><p className="privacy-note">移除世界只清理应用记录，绝不删除源目录。</p>{error&&<p role="alert">{error}</p>}</main>;
}


