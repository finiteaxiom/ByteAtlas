import { WorldHome } from './WorldHome';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HealthResult } from '../shared/contracts/desktop';
import { children, createObjects, descendants, entryPath, formatBytes, placeObjects, reconcileLayout, totalBytes, typeNames, type Layout, type Visit } from '../shared/world/model';
import { fixture, ROOT } from './demo/fixture';
import { CityRenderer } from './city/CityRenderer';
import { duskTheme, warmTheme } from './city/themes';
import './styles.css';

const STORAGE_KEY = 'byteatlas-demo-layout-v1';
const MOTION_KEY = 'byteatlas-environment-motion-v1';
function loadEnvironmentMotion(): boolean { try { return !matchMedia('(prefers-reduced-motion: reduce)').matches && localStorage.getItem(MOTION_KEY) !== 'off'; } catch { return false; } }
function loadLayouts(): Record<string, Layout> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!saved || typeof saved !== 'object') return {};
    const result: Record<string, Layout> = {};
    for (const [id, value] of Object.entries(saved).slice(0, 32)) {
      if (value?.version === 1 && typeof value.grouped === 'boolean' && value.slots &&
          Object.values(value.slots).every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n < 10000)) result[id] = value;
    }
    return result;
  } catch { return {}; }
}

function App({onExit}:{onExit:()=>void}): React.JSX.Element {
  const [health, setHealth] = useState<HealthResult>();
  const [directoryId, setDirectory] = useState(ROOT);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<Visit[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'capacity' | 'type' | 'activity'>('capacity');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [themeId, setTheme] = useState('warm'); const [environmentMotion, setEnvironmentMotion] = useState(loadEnvironmentMotion); const [placementDebug, setPlacementDebug] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<{ id: string; revision: number }>();
  const host = useRef<HTMLDivElement>(null), labels = useRef<HTMLDivElement>(null);
  const city = useRef<CityRenderer | undefined>(undefined);
  const [savedLayouts] = useState(loadLayouts);
  const layouts = useRef(savedLayouts);
  const visits = useRef(new Map<string, Visit>());
  const restore = useRef<Visit | undefined>(undefined);
  const theme = themeId === 'warm' ? warmTheme : duskTheme;
  const directory = fixture.find(e => e.id === directoryId)!;
  const path = entryPath(fixture, directoryId);
  const contents = descendants(fixture, directoryId);
  const direct = children(fixture, directoryId);
  const scene = useMemo(() => {
    const data = createObjects(fixture, directoryId, layouts.current[directoryId]);
    const layout = reconcileLayout(data.objects, data.grouped, layouts.current[directoryId]);
    layouts.current[directoryId] = layout;
    return placeObjects(data.objects, layout);
  }, [directoryId]);
  const selectedObject = scene.find(o => o.id === selectedId);
  const entry = fixture.find(e => e.id === selectedId);
  const revealed = entry?.kind === 'file' && scene.some(o => o.kind === 'group' && o.members.includes(entry.id)) ? entry : undefined;
  const members = selectedObject?.kind === 'group' ? fixture.filter(e => selectedObject.members.includes(e.id)) : [];
  const searchResults = query.trim() ? fixture.filter(e => e.id !== ROOT && entryPath(fixture, e.id).map(p => p.name).join('/').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 60) : [];
  function snapshot(): Visit { return { directoryId, selectedId, camera: city.current?.getCamera() }; }
  function navigate(id: string, select: string | null = null): void {
    const previous = snapshot(); visits.current.set(directoryId, previous);
    setHistory(h => [...h.slice(-49), previous]); restore.current = visits.current.get(id);
    setDirectory(id); setSelected(select); setPage(0);
  }
  function back(): void {
    const previous = history.at(-1); if (!previous) return;
    visits.current.set(directoryId, snapshot()); restore.current = previous;
    setDirectory(previous.directoryId); setSelected(previous.selectedId);
    setHistory(h => h.slice(0, -1)); setPage(0); setQuery(''); setFocus(undefined);
    if (previous.directoryId === directoryId) city.current?.restoreCamera(previous.camera);
  }
  function select(id: string | null): void { setSelected(id); setPage(0); setDetailsOpen(Boolean(id)); }
  function reveal(id: string): void {
    const target = fixture.find(e => e.id === id); if (!target || !target.parentId) return;
    if (target.parentId !== directoryId) navigate(target.parentId, id);
    else { setHistory(h => [...h.slice(-49), snapshot()]); setSelected(id); }
    setQuery(''); setFocus({ id, revision: Date.now() });
  }
  const callbacks = useRef({ select, navigate }); callbacks.current = { select, navigate };
  useEffect(() => {
    let active = true;
    window.byteAtlas.getHealth().then(value => { if (active) setHealth(value); }).catch(() => {
      if (active) setHealth({ ok: false, error: { code: 'UNAVAILABLE', message: '本地索引未连接，样例仍可探索。', retryable: true } });
    }); return () => { active = false; };
  }, []);
  useEffect(() => {
    try {
      const renderer = new CityRenderer(host.current!, labels.current!); city.current = renderer;
      renderer.onSelect = id => callbacks.current.select(id); renderer.onEnter = id => callbacks.current.navigate(id); renderer.setEnvironmentMotion(environmentMotion);
      renderer.onFailure = setError; setError('');
      return () => { renderer.dispose(); city.current = undefined; };
    } catch { setError('当前图形环境无法创建沙盘。你仍可使用左侧列表探索样例。'); host.current!.dataset.sceneState = 'error'; }
  }, [reload]);
  useEffect(() => {
    city.current?.setScene(scene, theme, mode, revealed, totalBytes(descendants(fixture, directoryId)), { key: directoryId, slots: direct.length });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts.current)); } catch { /* Stable in memory for this session. */ }
  }, [scene, theme, mode, revealed, reload]);
  useEffect(() => { city.current?.restoreCamera(restore.current?.camera, directoryId !== ROOT || Boolean(restore.current)); restore.current = undefined; }, [directoryId, reload]);
  useEffect(() => { city.current?.setSelection(selectedId); }, [selectedId, scene, theme, mode, reload]);
  useEffect(() => { if (focus) city.current?.focus(focus.id); }, [focus]);
  useEffect(() => { city.current?.setEnvironmentMotion(environmentMotion); try { localStorage.setItem(MOTION_KEY, environmentMotion ? 'on' : 'off'); } catch { /* Keep this isolated session setting in memory. */ } }, [environmentMotion]);
  useEffect(() => { city.current?.setPlacementDebug(placementDebug); }, [placementDebug]);

  const total = totalBytes(contents);
  const detailBytes = entry?.kind === 'directory' ? totalBytes(descendants(fixture, entry.id)) : entry?.bytes ?? selectedObject?.bytes;
  const title = entry?.name ?? selectedObject?.name;
  return <div className="app city-redesign" data-directory={directoryId} data-selected={selectedId ?? ''} data-theme={themeId} data-environment-motion={environmentMotion}>
    <header className="topbar"><button className="world-entry" data-action="worlds" onClick={onExit}>我的世界</button><div className="brand"><span className="brand-mark">B</span><strong>ByteAtlas</strong></div><button className="nav-back" data-action="back" disabled={!history.length} onClick={back}>← 返回</button><nav className="compact-crumbs" aria-label="目录路径">{path.map((item, i) => <span key={item.id}><button onClick={() => { if (item.id !== directoryId) navigate(item.id); }}>{item.name}</button>{i < path.length - 1 && <span>/</span>}</span>)}</nav><label className="top-search"><span>⌕</span><input aria-label="搜索样例文件" placeholder="搜索当前世界" value={query} onFocus={()=>setDirectoryOpen(true)} onChange={e => setQuery(e.target.value)} /></label><div className="top-mode-switch" aria-label="观察模式"><button aria-pressed={mode === 'capacity'} onClick={() => setMode('capacity')}>容量</button><button aria-pressed={mode === 'type'} onClick={() => setMode('type')}>类型</button><button aria-pressed={mode === 'activity'} onClick={() => setMode('activity')}>活动</button></div><button className="motion-toggle" data-action="motion" aria-label="切换环境动态" aria-pressed={environmentMotion} onClick={()=>setEnvironmentMotion(value=>!value)}>环境动态</button><span className="sample-badge">样例 · 未扫描电脑</span><select aria-label="城市配色" value={themeId} onChange={e=>setTheme(e.target.value)}><option value="warm">日光</option><option value="dusk">暖暮</option></select></header>
    <div className="workspace">
      <aside className="sidebar" data-open={directoryOpen}><div className="section-label">探索目录 <button aria-label="收起目录列表" onClick={()=>setDirectoryOpen(false)}>×</button></div><label className="search"><span>⌕</span><input aria-label="搜索样例文件抽屉" placeholder="搜索名称或路径" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <div className="directory-list">{query ? <><div className="list-heading">搜索结果 · {searchResults.length}{searchResults.length === 60 ? '+' : ''}</div>{searchResults.map(item => <button className="list-item" key={item.id} data-search-result={item.id} onClick={() => reveal(item.id)} title={entryPath(fixture, item.id).map(p => p.name).join('/')}><span>{item.kind === 'directory' ? '▤' : '▥'}</span><span>{item.name}<small>{item.kind === 'directory' ? '目录' : formatBytes(item.bytes)}</small></span></button>)}</> : <>{scene.map(object => <div className={`list-row ${selectedId === object.id ? 'selected' : ''}`} key={object.id}><button className="list-item" data-select={object.id} onClick={() => select(object.id)} onDoubleClick={() => { if (object.kind === 'directory') navigate(object.id); }} title={object.name}><span className={`file-icon ${object.kind}`}>{object.kind === 'directory' ? '▤' : object.kind === 'group' ? '▦' : '▥'}</span><span>{object.name}<small>{object.kind === 'group' ? `${object.count} 个文件 · 聚合` : object.kind === 'directory' ? `${object.count} 个文件${object.repository ? ' · Git' : ''}` : formatBytes(object.bytes)}</small></span></button>{object.kind === 'directory' && <button className="enter-small" aria-label={`进入${object.name}`} data-enter={object.id} onClick={() => navigate(object.id)}>›</button>}</div>)}{!scene.length && <p className="empty-note">这里是空目录。<br />沙盘保留一片空地。</p>}</>}</div>
        <div className="sidebar-foot"><span>固定样例</span><strong>同源目录列表</strong><p>建筑高度表示文件大小。<br />街区面积不代表精确容量。</p></div></aside>
      <section className="viewport" aria-label={`${directory.name} 城市探索区`}>
        <div className="world-stats"><span><b>{contents.filter(e => e.kind === 'file').length}</b> 个文件</span><span><b>{formatBytes(total)}</b> 逻辑大小</span><span>{scene.some(o => o.kind === 'group') ? '已聚合展示' : '固定布局'}</span></div>
        <div className="canvas-host" ref={host} data-scene-state="loading" /><div className="map-labels" ref={labels} />
        {error && <div className="graphics-error" role="alert">{error}<button onClick={() => setReload(n => n + 1)}>重新加载沙盘</button></div>}
        {revealed && <div className="reveal-note">已临时展开：{revealed.name}<button onClick={() => select(scene.find(o => o.members.includes(revealed.id))!.id)}>收起</button></div>}
        <div className="map-tools"><button className="drawer-toggle" aria-label="打开目录列表" onClick={()=>setDirectoryOpen(true)}>☰ 列表</button><button aria-label="放大" onClick={() => city.current?.zoom(1.2)}>＋</button><button aria-label="缩小" onClick={() => city.current?.zoom(1 / 1.2)}>−</button><button data-action="fit" onClick={() => city.current?.fitAll()}>俯瞰全部</button><button data-action="return-explore" onClick={() => city.current?.returnToExplore()}>回到街区</button><button aria-label="显示植被放置边界" aria-pressed={placementDebug} onClick={()=>setPlacementDebug(value=>!value)}>边界</button><button aria-pressed={helpOpen} aria-label="显示操作提示" onClick={()=>setHelpOpen(value=>!value)}>?</button></div>
        <div className="legend">{mode === 'type' ? Object.entries(typeNames).map(([type, name]) => <span key={type}><i style={{ background: theme.types[type as keyof typeof typeNames] }} />{name}</span>) : mode==='activity'?<span>◆ 最近 24 小时 · 样例变化，非真实读写</span>:<span>楼高表示文件大小；地块不表示精确容量</span>}<span className="environment-note">{environmentMotion?'树影轻动 · 装饰':'环境动态已关闭'}</span></div>{helpOpen&&<div className="map-help">拖动平移 · 滚轮缩放 · 右键旋转 · 双击街区进入</div>}</section>
      <aside className="details" data-open={detailsOpen} aria-label="对象详情"><div className="section-label">{title ? '选中对象' : '当前位置'}<button aria-label="关闭详情" onClick={() => {select(null);setDetailsOpen(false);}}>×</button></div>
        <div className={`detail-emblem ${selectedObject?.kind ?? entry?.kind ?? 'directory'}`}>{selectedObject?.kind === 'group' ? '▦' : entry?.kind === 'file' ? '▥' : '▤'}</div><h2>{title ?? directory.name}</h2><p className="detail-kind">{selectedObject?.kind === 'group' ? `${members.length} 个文件的聚合街区` : entry?.kind === 'file' ? `${typeNames[entry.fileType]} · 独立文件建筑` : `${entry?.repository || directory.repository ? 'Git 工业园' : '目录院落'}`}</p>
        <div className="detail-summary"><span><small>逻辑大小</small><b>{formatBytes(detailBytes ?? total)}</b></span><span><small>{entry?.kind === 'directory' ? '文件数量' : selectedObject?.kind === 'group' ? '聚合数量' : '类型'}</small><b>{entry?.kind === 'directory' ? `${descendants(fixture, entry.id).filter(item=>item.kind==='file').length} 项` : selectedObject?.kind === 'group' ? `${members.length} 项` : entry ? typeNames[entry.fileType] : '—'}</b></span></div>
        <details className="more-info"><summary>更多信息</summary><dl>{entry?.kind === 'file' && <><dt>精确字节数</dt><dd>{entry.bytes} B</dd></>}<dt>样例路径</dt><dd className="detail-path">{entryPath(fixture, entry?.id ?? directoryId).map(p => p.name).join(' / ')}</dd><dt>数据来源</dt><dd>固定样例，不来自你的电脑</dd>{entry && <><dt>样例修改时间</dt><dd>{new Date(entry.modifiedAt).toLocaleString('zh-CN')}</dd></>}</dl></details>
        {entry?.kind === 'directory' && <button className="primary" data-action="enter-selected" onClick={() => navigate(entry.id)}>进入这个街区 ↗</button>}{entry?.kind === 'file' && <p className="sample-note">这是虚构的样例文件，因此不提供系统打开或定位操作。</p>}
        {members.length > 0 && <div className="members"><div className="list-heading">组内文件 · {members.length}</div>{members.slice(page * 8, page * 8 + 8).map(member => <button key={member.id} data-reveal={member.id} title={member.name} onClick={() => reveal(member.id)}>{member.name}<small>{formatBytes(member.bytes)} ↗</small></button>)}<div className="pager"><button disabled={!page} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page + 1} / {Math.ceil(members.length / 8)}</span><button disabled={(page + 1) * 8 >= members.length} onClick={() => setPage(p => p + 1)}>下一页</button></div></div>}
        {!title && <div className="tip-card"><strong>从一个街区开始</strong><p>点击查看容量与类型，双击进入下一层。<br />目录按钮保留同源列表入口。</p><span>容量高度固定；活动仅代表样例的近期变化。</span></div>}</aside>
    </div><footer><span data-status={!health ? 'loading' : health.ok ? 'ready' : 'error'} role="status"><i />{health?.ok ? '本地索引已连接' : health ? health.error.message : '正在连接本地索引…'}</span><span>样例探索 · 阶段 1 <b>没有读取真实目录</b></span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><WorldHome Demo={App} /></StrictMode>);
