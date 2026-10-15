// Real Android input + WebView measurements. Emulator only, no login or backend fixtures.
// node scripts/onboarding-certification.mjs emulator-5556 phone
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const [serial, label] = process.argv.slice(2);
const regressionOnly = process.argv.includes('--regression');
const startupOnly = process.argv.includes('--startup-only');
assert.match(serial || '', /^emulator-\d+$/);
assert.match(label || '', /^[a-z0-9-]+$/);
const adb = process.env.ADB_EXE || 'C:/Users/jesus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const output = path.resolve('artifacts/m2-6-1');
mkdirSync(output, { recursive: true });
function command(args, binary = false) {
  const r = spawnSync(adb, ['-s', serial, ...args], { encoding: binary ? undefined : 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 30 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error(String(r.error || r.stderr));
  return r.stdout;
}
const save = (name, text) => writeFileSync(path.join(output, `${label}-${name}`), text);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function foreground(packageName) {
  for (let n = 0; n < 30; n++) {
    const activity = command(['shell', 'dumpsys', 'activity', 'activities']);
    if (activity.split('\n').some(line => /topResumedActivity|mResumedActivity/.test(line) && line.includes(packageName))) return;
    await pause(300);
  }
  throw Error(`Native foreground timeout: ${packageName}`);
}
const anrs = () => command(['shell', 'dumpsys', 'dropbox', '--print', 'data_app_anr']);
const appAnrs = text => [...text.matchAll(/Process: com\.cometaos\.pos\r?\n/g)].length;
const before = anrs(); save('anr-before.txt', before);
let socket, id = 0;
const pending = new Map();
const port = 9241;
async function connect() {
  socket?.close();
  const pid = command(['shell', 'pidof', 'com.cometaos.pos']).trim();
  assert.match(pid, /^\d+$/);
  command(['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`]);
  let page;
  for (let n = 0; n < 40; n++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p => p.url.startsWith('https://localhost')); } catch {}
    if (page) break;
    await pause(250);
  }
  assert.ok(page, 'Local Capacitor WebView required');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const value = JSON.parse(event.data), item = pending.get(value.id);
    if (item) { clearTimeout(item.timer); pending.delete(value.id); value.error ? item.reject(Error(value.error.message)) : item.resolve(value.result); }
  };
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { pending.delete(current); reject(Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(current, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
}
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result?.value;
}
async function until(expression) {
  for (let n = 0; n < 60; n++) { if (await evaluate(expression)) return; await pause(150); }
  throw Error(`UI timeout: ${expression}`);
}
function nativeTree(name) {
  command(['shell', 'uiautomator', 'dump', '/sdcard/cometa-certification.xml']);
  const xml = command(['shell', 'cat', '/sdcard/cometa-certification.xml']);
  save(`${name}.xml`, xml);
  assert.ok(!/isn.t responding|Application Not Responding/i.test(xml), 'Native ANR dialog visible');
  assert.ok(xml.includes('package="com.cometaos.pos"'), 'App not foreground in native hierarchy');
  return xml;
}
async function tap(selector) {
  const xml = nativeTree('latest-ui');
  const node = [...xml.matchAll(/<node\b[^>]+>/g)].map(m => m[0]).find(s => s.includes('class="android.webkit.WebView"'));
  assert.ok(node, 'Native WebView bounds required');
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds);
  const r = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight}; })()`);
  const x = +bounds[1] + r.x * (+bounds[3] - +bounds[1]) / r.w;
  const y = +bounds[2] + r.y * (+bounds[4] - +bounds[2]) / r.h;
  command(['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
}
async function capture(name) {
  await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
  await pause(450);
  nativeTree(name);
  save(`${name}.png`, command(['exec-out', 'screencap', '-p'], true));
}
async function resetPresentation() {
  await evaluate("localStorage.removeItem('cometa-pos-onboarding-v1'); location.reload()");
  await until("!!document.querySelector('.ob-continue')");
}
const metrics = [], restarts = [], resumes = [];
try {
  await connect();
  await resetPresentation();
  await evaluate("window.__longTasks=[]; new PerformanceObserver(l=>window.__longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true})");
  for (let n = 1; n <= (startupOnly ? 0 : 4); n++) {
    await capture(`slide-${n}`);
    const state = await evaluate(`(() => { const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,height:b.height}};return {slide:document.querySelector('.pos-onboarding').dataset.slide,layout:document.querySelector('.pos-onboarding').dataset.layout,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,cta:r('.ob-continue'),account:r('.ob-account'),skip:r('.ob-skip'),progress:document.querySelector('.ob-count').innerText,images:[...document.images].map(i=>({src:new URL(i.src).pathname,width:i.naturalWidth,height:i.naturalHeight,complete:i.complete})),buttons:[...document.querySelectorAll('.pos-onboarding button')].map(b=>b.getBoundingClientRect().height),longTasks:window.__longTasks};})()`);
    metrics.push(state);
    console.log(`${label}: slide ${n} captured with native input checks`);
    assert.ok(state.scrollWidth <= state.width + 1 && state.scrollHeight <= state.height + 1, 'Overflow');
    assert.ok(state.cta.bottom <= state.height + 1 && state.account.bottom <= state.height + 1, 'CTA/account clipped');
    assert.ok(state.skip.y >= 0 && state.buttons.every(h => h >= 43.5), 'Safe area / touch target');
    assert.ok(state.images.every(i => i.complete && i.width > 0), 'Image decode failed');
    assert.ok(state.progress.startsWith(`0${n}`), 'Incorrect progress');
    if (n < 4) { await tap('.ob-continue'); await until(`document.querySelector('.ob-count b')?.textContent==='0${n + 1}'`); }
  }
  if (!startupOnly) {
  await tap('[aria-label="Ir a slide 1"]');
  await until("document.querySelector('.ob-count b')?.textContent==='01'");
  await tap('.ob-skip'); await until("!!document.querySelector('input[type=email]')");
  await capture('auth-after-skip');
  assert.equal(await evaluate("localStorage.getItem('cometa-pos-onboarding-v1')"), 'yes');
  await evaluate('location.reload()'); await until("!!document.querySelector('input[type=email]')");
  await resetPresentation(); await tap('.ob-account'); await until("!!document.querySelector('input[type=email]')");
  await capture('auth-after-account');
  await resetPresentation(); await tap('[aria-label="Ir a slide 4"]');
  await until("document.querySelector('.ob-count b')?.textContent==='04'");
  await tap('.ob-continue'); await until("!!document.querySelector('input[type=email]')");
  await capture('auth-after-final');
  await resetPresentation();
  }
  for (let n = 1; n <= (regressionOnly ? 0 : 3); n++) {
    const start = Date.now();
    command(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    await foreground('com.google.android.apps.nexuslauncher');
    const launch = command(['shell', 'am', 'start', '-W', '-n', 'com.cometaos.pos/.MainActivity']);
    assert.match(launch, /Status: ok/, 'Android resume timed out');
    await foreground('com.cometaos.pos');
    await until("!!document.querySelector('.ob-continue')");
    await capture(`resume-${n}`);
    resumes.push({ iteration: n, elapsedMs: Date.now() - start, launch });
  }
  for (let n = 1; n <= (regressionOnly ? 0 : 5); n++) {
    socket.close();
    command(['shell', 'am', 'force-stop', 'com.cometaos.pos']);
    const start = Date.now();
    const launch = command(['shell', 'am', 'start', '-W', '-n', 'com.cometaos.pos/.MainActivity']);
    assert.match(launch, /Status: ok/, 'Android cold launch timed out');
    await connect(); await until("!!document.querySelector('.ob-continue')");
    await capture(`cold-start-${n}`);
    restarts.push({ iteration: n, elapsedMs: Date.now() - start, launch });
  }
  const after = anrs(); save('anr-after.txt', after);
  assert.equal(appAnrs(after), appAnrs(before), 'New app ANR recorded');
  save('meminfo.txt', command(['shell', 'dumpsys', 'meminfo', 'com.cometaos.pos']));
  save('gfxinfo.txt', command(['shell', 'dumpsys', 'gfxinfo', 'com.cometaos.pos']));
  const result = { serial, label, metrics, resumes, restarts, newAppAnrs: appAnrs(after) - appAnrs(before), nativeInput: 'PASS', navigation: startupOnly ? 'NOT_RUN' : 'PASS', backgroundResume: regressionOnly ? 'NOT_RUN' : 'PASS', repeatedLaunch: regressionOnly ? 'NOT_RUN' : 'PASS' };
  save('result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ label, result: 'PASS', slides: metrics.length, resumes: resumes.length, coldStarts: restarts.length, newAppAnrs: result.newAppAnrs }));
} catch (error) {
  save('failure.txt', String(error.stack));
  save('failure.png', command(['exec-out', 'screencap', '-p'], true));
  throw error;
} finally {
  socket?.close();
  command(['forward', '--remove', `tcp:${port}`]);
}
