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
    const rootMetrics = { drawCalls: Number(el('.canvas-host').dataset.drawCalls), triangles: Number(el('.canvas-host').dataset.triangles) };
    if (!rootMetrics.triangles) throw new Error('No three-dimensional geometry rendered');
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
    return { passed: true, rootMetrics, checks: ['WebGL geometry','enter/back camera and selection','theme spatial invariance','aggregation and reveal','Chinese search and exact bytes','empty directory'] };
  })()`);
  const geometry = await contents.executeJavaScript(`(() => {
    const host = document.querySelector('.canvas-host'), rect = host.getBoundingClientRect();
    const label = document.querySelector('[data-object-id="01-workshop"]');
    return { left:rect.left, top:rect.top, width:rect.width, height:rect.height, x:Math.round(rect.left+Number(label.dataset.pickX)), y:Math.round(rect.top+Number(label.dataset.pickY)) };
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
  contents.sendInputEvent({ type: 'mouseDown', x: geometry.x, y: geometry.y, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', x: geometry.x, y: geometry.y, button: 'left', clickCount: 1 });
  await settle();
  if ((await read()).selected !== '01-workshop') throw new Error('Three.js raycast did not select the expected district');
  contents.sendInputEvent({ type: 'mouseDown', x: geometry.x, y: geometry.y, button: 'left', clickCount: 2 });
  contents.sendInputEvent({ type: 'mouseUp', x: geometry.x, y: geometry.y, button: 'left', clickCount: 2 });
  await contents.executeJavaScript('new Promise(r => setTimeout(r,350))');
  if ((await read()).directory !== '01-workshop') throw new Error('Canvas double click did not enter directory');
  await contents.executeJavaScript(`document.querySelector('[data-action="back"]').click()`);
  await contents.executeJavaScript('new Promise(r => setTimeout(r,350))');
  await contents.executeJavaScript(`document.querySelector('[aria-label="关闭详情"]')?.click()`);
  return { ...interfaceChecks, pointerChecks: ['wheel zoom retains directory', 'pan does not select', 'right drag rotates', 'raycast selects district', 'canvas double click enters'] };
}
