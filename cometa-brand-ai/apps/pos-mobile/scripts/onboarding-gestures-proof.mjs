// Local Chromium touch-input and viewport-rotation regression. No backend writes.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = 'artifacts/m2-6-2';
mkdirSync(out, { recursive: true });
const tabs = await (await fetch('http://127.0.0.1:9248/json')).json();
const socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
socket.onmessage = event => {
  const r = JSON.parse(event.data), p = pending.get(r.id);
  if (p) { clearTimeout(p.timer); pending.delete(r.id); r.error ? p.reject(Error(r.error.message)) : p.resolve(r.result); }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => reject(Error(`Timeout ${method}`)), 15000);
    pending.set(n, { resolve, reject, timer }); socket.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const slide = () => evaluate('document.querySelector(".pos-onboarding")?.dataset.slide');
async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: width > height ? 'landscapePrimary' : 'portraitPrimary', angle: width > height ? 90 : 0 } });
  await pause(150);
}
async function tap(selector) {
  const { x, y } = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(280);
}
async function swipe(dx, dy = 0) {
  const { x, y } = await evaluate('({x:innerWidth*.72,y:innerHeight*.30})');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let n = 1; n <= 6; n++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx*n/6, y: y + dy*n/6 }] });
    await pause(20);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(300);
}
async function reset() {
  await evaluate("localStorage.removeItem('cometa-pos-onboarding-v1');location.reload()");
  for (let n = 0; n < 100; n++) { if (await slide()) return; await pause(100); }
  throw Error('Onboarding mount timeout');
}
const report = [];
try {
  await send('Page.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await viewport(412, 867);
  await send('Page.navigate', { url: process.env.PROOF_URL || 'http://127.0.0.1:5182' });
  for (let n = 0; n < 100; n++) { if (await slide()) break; await pause(100); }
  await reset();
  await swipe(90); assert.equal(await slide(), 'ecosystem');
  await swipe(-130); assert.equal(await slide(), 'food');
  await swipe(-130); assert.equal(await slide(), 'retail');
  await swipe(90); assert.equal(await slide(), 'food');
  await swipe(-15, 100); assert.equal(await slide(), 'food', 'Vertical scroll must not navigate');
  await swipe(-20); assert.equal(await slide(), 'food', 'Short drag must not navigate');
  await tap('.ob-continue'); assert.equal(await slide(), 'retail');
  await tap('.ob-tracks button:nth-child(4)'); assert.equal(await slide(), 'omnichannel');
  await swipe(-130); assert.equal(await slide(), 'omnichannel', 'Last slide must not complete on swipe');
  const stamp = await evaluate('window.__rotationStamp=performance.timeOrigin;window.__onboardingNode=document.querySelector(".pos-onboarding");window.__rotationStamp');
  for (const [width, height] of [[412,867],[867,412],[412,867],[360,640],[640,360],[320,568],[568,320],[780,360],[960,432],[1280,744],[800,1224]]) {
    await viewport(width, height);
    await evaluate(`(()=>{const s=document.documentElement.style;for(const [edge,value] of Object.entries(${JSON.stringify(width === 780 ? {top:24,bottom:16,left:32,right:32} : {top:0,bottom:0,left:0,right:0})}))s.setProperty('--safe-area-inset-'+edge,value+'px')})()`);
    assert.equal(await evaluate('performance.timeOrigin'), stamp, 'No document reload');
    assert.equal(await evaluate('window.__onboardingNode===document.querySelector(".pos-onboarding")'), true, 'No remount');
    assert.equal(await slide(), 'omnichannel', 'Rotation preserves slide');
    for (let i = 1; i <= 4; i++) {
      await tap(`.ob-tracks button:nth-child(${i})`);
      await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
      const metrics = await evaluate(`(()=>{
        const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
        return {w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,headline:rect('h1'),cta:rect('.ob-continue'),account:rect('.ob-account'),progress:rect('.ob-progress'),photo:rect('.ob-photo'),content:rect('.ob-content')};
      })()`);
      report.push({ width, height, slide: i, ...metrics });
      assert.ok(metrics.scrollW <= width + 1, `Horizontal overflow ${width}x${height} slide ${i}`);
      assert.ok(metrics.scrollH <= height + 1, `Vertical overflow ${width}x${height} slide ${i}: ${metrics.scrollH}`);
      for (const name of ['headline','cta','account','progress']) {
        const r = metrics[name];
        assert.ok(r.y >= 0 && r.bottom <= height + 1 && r.x >= 0 && r.right <= width + 1, `${name} offscreen ${width}x${height} slide ${i}`);
      }
      if (width > height && height < 600) assert.ok(Math.abs(metrics.content.width / width - .44) < .01);
      if ([[412,867],[867,412],[568,320],[1280,744]].some(([w,h])=>w===width&&h===height)) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${out}/${width}x${height}-slide-${i}.png`, Buffer.from(shot.data, 'base64'));
      }
    }
  }
  await viewport(867,412);
  await swipe(100); assert.equal(await slide(), 'retail');
  await swipe(-130); assert.equal(await slide(), 'omnichannel');
  for (const control of ['.ob-continue','.ob-skip','.ob-account']) {
    await tap(control);
    assert.equal(await evaluate("localStorage.getItem('cometa-pos-onboarding-v1')"), 'yes');
    assert.equal(await slide(), undefined);
    await reset();
    await tap('.ob-tracks button:nth-child(4)');
  }
  console.log('PASS: touch swipes, boundaries, vertical/short gestures, controls, all slides, portrait/landscape/portrait state and no overflow.');
} finally {
  writeFileSync(`${out}/responsive-results.json`, JSON.stringify(report, null, 2));
  socket.close();
}
