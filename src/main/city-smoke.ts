import type { WebContents } from 'electron';

// Exercises the rendered UI; no filesystem or generic testing bridge is exposed.
export async function exerciseCity(contents: WebContents): Promise<unknown> {
  const interfaceChecks = await contents.executeJavaScript(`(async () => {
    const wait = async (predicate, name) => {
      for (let i = 0; i < 150; i++) {
        if (predicate()) { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return; }
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error('City check failed: ' + name + ' / ' + document.querySelector('.graphics-error')?.textContent);
    };
    const el = selector => { const found = document.querySelector(selector); if (!found) throw new Error('Missing ' + selector); return found; };
    const click = async selector => { el(selector).click(); await new Promise(r => setTimeout(r, 70)); };
    const directory = id => document.querySelector('.app')?.dataset.directory === id && document.querySelector('.canvas-host')?.dataset.transition === 'false';
    const camera = () => JSON.parse(el('.canvas-host').dataset.camera);
    const cameraEqual = (a,b) => Math.abs(a.zoom-b.zoom) < 1e-8 && [...a.position,...a.target].every((v,i) => Math.abs(v - [...b.position,...b.target][i]) < 1e-7);
    await wait(() => document.querySelector('.canvas-host')?.dataset.sceneState === 'ready', 'WebGL frame');
    await wait(() => ['ready','partial-fallback'].includes(document.querySelector('.canvas-host')?.dataset.professionalAssets ?? ''), 'professional assets');
    const rootMetrics = { drawCalls: Number(el('.canvas-host').dataset.drawCalls), triangles: Number(el('.canvas-host').dataset.triangles), visibleObjects: Number(el('.canvas-host').dataset.visibleObjects), textureCount: Number(el('.canvas-host').dataset.textureCount), textureBytes: Number(el('.canvas-host').dataset.textureBytes) };
    if (!rootMetrics.triangles) throw new Error('No three-dimensional geometry rendered');
    const rootIsland = el('.canvas-host').dataset.islandKey;
    if (rootIsland !== 'world' || Number(el('.canvas-host').dataset.islandPoints) < 20 || el('.canvas-host').dataset.waterMesh !== '56x56') throw new Error('Stable island environment was not rendered');
    if (Number(el('.canvas-host').dataset.professionalBuildings) < 1 || Number(el('.canvas-host').dataset.professionalTrees) < 2 || Number(el('.canvas-host').dataset.professionalGrass) < 1) throw new Error('Professional asset fallback was not populated');
    const professionalGround = Number(el('.canvas-host').dataset.professionalLowestY);
    if (Math.min(Math.abs(professionalGround - .62), Math.abs(professionalGround + .12)) > .02) throw new Error('Professional model root did not settle on an explicit city or coast ground plane');
    await click('[aria-label="显示植被放置边界"]'); await wait(() => el('.canvas-host').dataset.placementDebug === 'true', 'placement debug enabled');
    await click('[aria-label="显示植被放置边界"]'); await wait(() => el('.canvas-host').dataset.placementDebug === 'false', 'placement debug disabled');
    await click('[data-select="01-workshop"]');
    await click('[aria-label="放大"]');
    const before = camera();
    await click('[data-enter="01-workshop"]'); await wait(() => directory('01-workshop'), 'enter');
    await click('[data-action="back"]'); await wait(() => directory('world'), 'back');
    if (!cameraEqual(before, camera()) || el('.app').dataset.selected !== '01-workshop') throw new Error('Camera or selection not restored');
    const switchTheme = async value => { el('select').value = value; el('select').dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,120)); };
    const positions = () => [...document.querySelectorAll('.map-label')].map(e => [e.dataset.objectId,e.style.transform]);
    const positionsBefore = JSON.stringify(positions());
    await switchTheme('dusk');
    if (el('.app').dataset.theme !== 'dusk' || !cameraEqual(before,camera()) || JSON.stringify(positions()) !== positionsBefore) throw new Error('Theme changed spatial state');
    await switchTheme('warm');
    await click('[data-enter="05-assets"]'); await wait(() => directory('05-assets'), 'dense directory');
    await wait(() => ['ready','partial-fallback'].includes(el('.canvas-host').dataset.professionalAssets ?? ''), 'dense directory assets');
    if (el('.canvas-host').dataset.islandKey !== '05-assets' || Number(el('.canvas-host').dataset.islandPoints) < 20) throw new Error('Dense directory retained a prior island environment');
    const group = [...document.querySelectorAll('[data-select]')].find(e => e.dataset.select.startsWith('group:'));
    if (!group) throw new Error('Missing aggregation');
    group.click(); await wait(() => document.querySelector('[data-reveal]'), 'group members');
    const member = el('[data-reveal]').dataset.reveal;
    await click('[data-reveal]'); await wait(() => el('.app').dataset.selected === member && document.querySelector('.reveal-note'), 'reveal');
    const input = el('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'素材母版');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    await wait(() => document.querySelector('[data-search-result="huge"]'), 'Chinese search');
    await click('[data-search-result="huge"]'); await wait(() => directory('04-archive') && el('.app').dataset.selected === 'huge', 'search navigation');
    if (!el('.details').textContent.includes('68719476736 B')) throw new Error('Incorrect exact byte count');
    const rootCrumb = [...document.querySelectorAll('.compact-crumbs button')].find(e => e.textContent === '我的工作空间');
    if (!rootCrumb) throw new Error('Missing root breadcrumb');
    rootCrumb.click();
    await wait(() => directory('world'), 'home');
    await click('[data-enter="06-empty"]'); await wait(() => directory('06-empty'), 'empty directory');
    if (document.querySelectorAll('[data-select]').length !== 0) throw new Error('Empty directory has fake objects');
    await click('[data-action="back"]'); await wait(() => directory('world'), 'final home');
    await click('[data-action="fit"]');
    await wait(() => el('.canvas-host').dataset.cameraMode === 'overview', 'overview mode');
    await click('[data-action="return-explore"]'); await wait(() => el('.canvas-host').dataset.cameraMode === 'explore', 'explore mode');
    for (let i=0;i<12;i++) await click('[aria-label="缩小"]');
    if (camera().zoom < .7) throw new Error('Explore zoom escaped its lower bound');
    await click('[data-action="motion"]'); await wait(() => el('.canvas-host').dataset.environmentMotion === 'false', 'motion disabled');
    await click('[data-action="motion"]'); await wait(() => el('.canvas-host').dataset.environmentMotion === 'true', 'motion enabled');
    if (Number(el('.canvas-host').dataset.professionalTrees) < 2 || Number(el('.canvas-host').dataset.professionalGrass) < 1) throw new Error('Professional vegetation was not retained after navigation');
    return { passed: true, rootMetrics, checks: ['WebGL geometry','professional asset placement, grounding, and debug toggle','enter/back camera and selection','theme spatial invariance','aggregation and reveal','Chinese search and exact bytes','empty directory','overview/explore camera bounds','environment-motion preference','professional vegetation budget'] };
  })()`);
  const read = (): Promise<{ camera: string; directory: string; selected: string }> => contents.executeJavaScript(`({ camera:document.querySelector('.canvas-host').dataset.camera, directory:document.querySelector('.app').dataset.directory, selected:document.querySelector('.app').dataset.selected })`);
  const settle = (): Promise<unknown> => contents.executeJavaScript('new Promise(r => setTimeout(r,100))');
  const before = await read();
  const interactionPoint = await contents.executeJavaScript(`(() => {
    const r=document.querySelector('canvas').getBoundingClientRect();
    for(let fy=.32;fy<.82;fy+=.1) for(let fx=.22;fx<.78;fx+=.1) {
      const x=Math.round(r.left+r.width*fx), y=Math.round(r.top+r.height*fy);
      if(document.elementFromPoint(x,y)?.tagName==='CANVAS') return {x,y};
    }
    throw new Error('No uncovered canvas point');
  })()`);
  const { x, y } = interactionPoint;
  contents.sendInputEvent({ type: 'mouseWheel', x, y, deltaY: 100, deltaX: 0, canScroll: true });
  await settle();
  const zoomed = await read();
  if (zoomed.camera === before.camera || zoomed.directory !== before.directory) throw new Error('Wheel did not zoom within the same directory');
  contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseMove', x: x + 45, y: y + 15, modifiers: ['leftbuttondown'] });
  contents.sendInputEvent({ type: 'mouseUp', x: x + 45, y: y + 15, button: 'left', clickCount: 1 });
  await settle();
  const panned = await read();
  if (panned.camera === zoomed.camera || panned.selected !== before.selected) throw new Error('Pan selected a file or did not move');
  for (const [dx, dy] of [[260, 0], [-520, 0], [0, 260], [0, -520]] as const) {
    contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseMove', x: x + dx, y: y + dy, modifiers: ['leftbuttondown'] });
    contents.sendInputEvent({ type: 'mouseUp', x: x + dx, y: y + dy, button: 'left', clickCount: 1 });
    await settle();
  }
  const bounded = await contents.executeJavaScript(`(() => { const camera=JSON.parse(document.querySelector('.canvas-host').dataset.camera), bounds=JSON.parse(document.querySelector('.canvas-host').dataset.cameraBounds); return camera.target[0]>=bounds.minX-1&&camera.target[0]<=bounds.maxX+1&&camera.target[2]>=bounds.minZ-1&&camera.target[2]<=bounds.maxZ+1; })()`);
  if (!bounded) throw new Error('Pan escaped scene camera bounds');
  const rotatePoint = await contents.executeJavaScript(`(() => {
    const r=document.querySelector('canvas').getBoundingClientRect();
    for(let fy=.35;fy<.8;fy+=.1) for(let fx=.25;fx<.75;fx+=.1) {
      const x=Math.round(r.left+r.width*fx), y=Math.round(r.top+r.height*fy);
      if(document.elementFromPoint(x,y)?.tagName==='CANVAS') return {x,y};
    }
    throw new Error('No uncovered canvas point');
  })()`);
  contents.sendInputEvent({ type: 'mouseMove', x: rotatePoint.x, y: rotatePoint.y });
  contents.sendInputEvent({ type: 'mouseDown', x: rotatePoint.x, y: rotatePoint.y, button: 'right', clickCount: 1 });
  await settle();
  contents.sendInputEvent({ type: 'mouseMove', x: rotatePoint.x + 40, y: rotatePoint.y + 10, modifiers: ['rightbuttondown'] });
  await settle();
  contents.sendInputEvent({ type: 'mouseUp', x: rotatePoint.x + 40, y: rotatePoint.y + 10, button: 'right', clickCount: 1 });
  await settle();
  if ((await read()).camera === panned.camera) throw new Error('Right drag did not rotate');
  await contents.executeJavaScript(`document.querySelector('[data-action="fit"]').click()`); await settle();
  const waterPoint = await contents.executeJavaScript(`(() => { const r=document.querySelector('canvas').getBoundingClientRect(); return {x:Math.round(r.left+12),y:Math.round(r.top+r.height*.46)}; })()`);
  contents.sendInputEvent({ type: 'mouseDown', x: waterPoint.x, y: waterPoint.y, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', x: waterPoint.x, y: waterPoint.y, button: 'left', clickCount: 1 });
  await settle();
  if ((await read()).selected) throw new Error('Environment water was treated as a file object');
  return { ...interfaceChecks, pointerChecks: ['wheel zoom retains directory', 'pan does not select', 'right drag rotates', 'water click clears selection and has no file action'] };
}
