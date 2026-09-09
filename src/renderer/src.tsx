import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HealthResult } from '../shared/contracts/desktop';
import { children, createObjects, descendants, entryPath, formatBytes, placeObjects, reconcileLayout, totalBytes, typeNames, type Layout, type Visit } from '../shared/world/model';
import { fixture, ROOT } from './demo/fixture';
import { CityRenderer } from './city/CityRenderer';
import { duskTheme, warmTheme } from './city/themes';
import './styles.css';

const STORAGE_KEY = 'byteatlas-demo-layout-v1';
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

function App(): React.JSX.Element {
  const [health, setHealth] = useState<HealthResult>();
  const [directoryId, setDirectory] = useState(ROOT);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<Visit[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'capacity' | 'type'>('capacity');
  const [themeId, setTheme] = useState('warm');
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
  function select(id: string | null): void { setSelected(id); setPage(0); }
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
      renderer.onSelect = id => callbacks.current.select(id); renderer.onEnter = id => callbacks.current.navigate(id);
      renderer.onFailure = setError; setError('');
      return () => { renderer.dispose(); city.current = undefined; };
    } catch { setError('当前图形环境无法创建沙盘。你仍可使用左侧列表探索样例。'); host.current!.dataset.sceneState = 'error'; }
  }, [reload]);
  useEffect(() => {
    city.current?.setScene(scene, theme, mode, revealed);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts.current)); } catch { /* Stable in memory for this session. */ }
  }, [scene, theme, mode, revealed, reload]);
  useEffect(() => { city.current?.restoreCamera(restore.current?.camera, directoryId !== ROOT || Boolean(restore.current)); restore.current = undefined; }, [directoryId, reload]);
  useEffect(() => { city.current?.setSelection(selectedId); }, [selectedId, scene, theme, mode, reload]);
  useEffect(() => { if (focus) city.current?.focus(focus.id); }, [focus]);

  const total = totalBytes(contents);
  const detailBytes = entry?.kind === 'directory' ? totalBytes(descendants(fixture, entry.id)) : entry?.bytes ?? selectedObject?.bytes;
  const title = entry?.name ?? selectedObject?.name;
  return <div className="app" data-directory={directoryId} data-selected={selectedId ?? ''} data-theme={themeId}>
    <header className="topbar"><div className="brand"><span className="brand-mark">B</span><strong>ByteAtlas</strong><span>电脑世界探索器</span></div><span className="sample-badge">样例世界 · 未扫描电脑</span><select aria-label="城市配色" value={themeId} onChange={e => setTheme(e.target.value)}><option value="warm">日光微缩</option><option value="dusk">暖暮配色 · 主题验证</option></select></header>
    <nav className="pathbar" aria-label="目录路径"><button data-action="back" disabled={!history.length} onClick={back}>← 返回</button><span className="path-home">⌂</span>{path.map((item, i) => <span key={item.id}><button onClick={() => { if (item.id !== directoryId) navigate(item.id); }}>{item.name}</button>{i < path.length - 1 && <span className="separator">/</span>}</span>)}<span className="path-end">本地样例 / 固定数据</span></nav>
    <div className="workspace">
      <aside className="sidebar"><div className="section-label">探索目录 <span>{direct.length}</span></div><label className="search"><span>⌕</span><input aria-label="搜索样例文件" placeholder="搜索名称或路径" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <div className="directory-list">{query ? <><div className="list-heading">搜索结果 · {searchResults.length}{searchResults.length === 60 ? '+' : ''}</div>{searchResults.map(item => <button className="list-item" key={item.id} data-search-result={item.id} onClick={() => reveal(item.id)} title={entryPath(fixture, item.id).map(p => p.name).join('/')}><span>{item.kind === 'directory' ? '▤' : '▥'}</span><span>{item.name}<small>{item.kind === 'directory' ? '目录' : formatBytes(item.bytes)}</small></span></button>)}</> : <>{scene.map(object => <div className={`list-row ${selectedId === object.id ? 'selected' : ''}`} key={object.id}><button className="list-item" data-select={object.id} onClick={() => select(object.id)} onDoubleClick={() => { if (object.kind === 'directory') navigate(object.id); }} title={object.name}><span className={`file-icon ${object.kind}`}>{object.kind === 'directory' ? '▤' : object.kind === 'group' ? '▦' : '▥'}</span><span>{object.name}<small>{object.kind === 'group' ? `${object.count} 个文件 · 聚合` : object.kind === 'directory' ? `${object.count} 个文件${object.repository ? ' · Git' : ''}` : formatBytes(object.bytes)}</small></span></button>{object.kind === 'directory' && <button className="enter-small" aria-label={`进入${object.name}`} data-enter={object.id} onClick={() => navigate(object.id)}>›</button>}</div>)}{!scene.length && <p className="empty-note">这里是空目录。<br />沙盘保留一片空地。</p>}</>}</div>
        <div className="sidebar-foot"><span>DEMO COLLECTION</span><strong>一座可以读懂的城市</strong><p>建筑高度表示文件大小。<br />街区面积不代表精确容量。</p></div></aside>
      <section className="viewport" aria-label="城市探索区"><div className="scene-heading"><div><span className="eyebrow">THE LITTLE WORLD</span><h1>{directory.name}</h1></div><div className="mode-switch"><button aria-pressed={mode === 'capacity'} onClick={() => setMode('capacity')}>容量</button><button aria-pressed={mode === 'type'} onClick={() => setMode('type')}>类型</button></div></div>
        <div className="world-stats"><span><b>{contents.filter(e => e.kind === 'file').length}</b> 个文件</span><span><b>{formatBytes(total)}</b> 逻辑大小</span><span>{scene.some(o => o.kind === 'group') ? '已聚合展示' : '固定布局'}</span></div>
        <div className="canvas-host" ref={host} data-scene-state="loading" /><div className="map-labels" ref={labels} />
        {error && <div className="graphics-error" role="alert">{error}<button onClick={() => setReload(n => n + 1)}>重新加载沙盘</button></div>}
        {revealed && <div className="reveal-note">已临时展开：{revealed.name}<button onClick={() => select(scene.find(o => o.members.includes(revealed.id))!.id)}>收起</button></div>}
        <div className="map-tools"><button aria-label="放大" onClick={() => city.current?.zoom(1.2)}>＋</button><button aria-label="缩小" onClick={() => city.current?.zoom(1 / 1.2)}>−</button><button data-action="fit" onClick={() => city.current?.restoreCamera()}>俯瞰当前目录</button></div>
        <div className="legend">{mode === 'type' ? Object.entries(typeNames).map(([type, name]) => <span key={type}><i style={{ background: theme.types[type as keyof typeof typeNames] }} />{name}</span>) : <span>矮楼 → 高楼 <b>文件从小到大</b></span>}</div><div className="map-help">拖动平移 · 滚轮缩放 · 右键旋转 · 双击街区进入</div></section>
      <aside className="details" aria-label="对象详情"><div className="section-label">{title ? '选中对象' : '当前位置'}{title && <button aria-label="关闭详情" onClick={() => select(null)}>×</button>}</div>
        <div className={`detail-emblem ${selectedObject?.kind ?? entry?.kind ?? 'directory'}`}>{selectedObject?.kind === 'group' ? '▦' : entry?.kind === 'file' ? '▥' : '▤'}</div><h2>{title ?? directory.name}</h2><p className="detail-kind">{selectedObject?.kind === 'group' ? `${members.length} 个文件的聚合模型` : entry?.kind === 'file' ? `${typeNames[entry.fileType]} · 文件建筑` : `${entry?.repository || directory.repository ? 'Git 工业园' : '目录街区'}`}</p>
        <dl><dt>逻辑大小</dt><dd>{formatBytes(detailBytes ?? total)}</dd>{entry?.kind === 'file' && <><dt>精确字节数</dt><dd>{entry.bytes} B</dd></>}<dt>样例路径</dt><dd className="detail-path">{entryPath(fixture, entry?.id ?? directoryId).map(p => p.name).join(' / ')}</dd><dt>数据来源</dt><dd>固定样例，不来自你的电脑</dd>{entry && <><dt>样例修改时间</dt><dd>{new Date(entry.modifiedAt).toLocaleString('zh-CN')}</dd></>}</dl>
        {entry?.kind === 'directory' && <button className="primary" data-action="enter-selected" onClick={() => navigate(entry.id)}>进入这个街区 ↗</button>}{entry?.kind === 'file' && <p className="sample-note">这是虚构的样例文件，因此不提供系统打开或定位操作。</p>}
        {members.length > 0 && <div className="members"><div className="list-heading">组内文件 · {members.length}</div>{members.slice(page * 8, page * 8 + 8).map(member => <button key={member.id} data-reveal={member.id} title={member.name} onClick={() => reveal(member.id)}>{member.name}<small>{formatBytes(member.bytes)} ↗</small></button>)}<div className="pager"><button disabled={!page} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page + 1} / {Math.ceil(members.length / 8)}</span><button disabled={(page + 1) * 8 >= members.length} onClick={() => setPage(p => p + 1)}>下一页</button></div></div>}
        {!title && <div className="tip-card"><strong>从一个街区开始</strong><p>点击查看详情，双击进入。<br />也可以从左侧目录直接探索。</p><span>温暖、明亮，像桌上的模型。</span></div>}</aside>
    </div><footer><span data-status={!health ? 'loading' : health.ok ? 'ready' : 'error'} role="status"><i />{health?.ok ? '本地索引已连接' : health ? health.error.message : '正在连接本地索引…'}</span><span>样例探索 · 阶段 1 <b>没有读取真实目录</b></span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
