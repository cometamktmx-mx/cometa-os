// Real Chromium screenshots with existing LOCAL Auth; no mock API responses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const fixture = JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json', 'utf8'));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const output = 'docs/visual-evidence/comu-seller-v1'; fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'comu-seller-visual-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9236', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket, seq = 0; const pending = new Map();
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('Browser evaluation failed'); return r.result.value; }
const results = [];
try {
  let tabs;
  for (let i = 0; i < 80; i++) { try { tabs = await (await fetch('http://127.0.0.1:9236/json/list')).json(); if (tabs.length) break; } catch {} await sleep(250); }
  assert.ok(tabs?.length, 'Headless Chromium unavailable'); socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } });
  await send('Page.enable'); await send('Network.enable');
  for (const [label, state] of [['a', 'ACTIVE'], ['b', 'PREPARING']]) {
    const user = fixture.users[label], jar = new Map();
    const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: rows => rows.forEach(r => jar.set(r.name, r.value)) } });
    assert.equal((await auth.auth.signInWithPassword({ email: user.email, password: user.password })).error, null);
    const seller = await admin.from('comu_sellers').select('brand_slug,status').eq('id', user.sellerId).single(); assert.equal(seller.error, null); assert.equal(seller.data.status, state);
    await send('Network.clearBrowserCookies'); await send('Network.setCookies', { cookies: [...jar].map(([name, value]) => ({ name, value, url: 'http://localhost:3000', path: '/', sameSite: 'Lax' })) });
    for (const [device, width, height] of [['desktop', 1536, 1024], ['tablet', 834, 1112], ['phone', 390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: device === 'phone' });
      await send('Page.navigate', { url: `http://localhost:3000/comu/seller/${seller.data.brand_slug}/summary` });
      let ready = false;
      for (let i = 0; i < 100; i++) { ready = await evaluate(`document.querySelector('[data-seller-state="${state}"]') !== null`); if (ready) break; await sleep(300); }
      assert.ok(ready, `Dashboard ${state} not ready: ` + await evaluate('document.body.innerText.slice(0,300)'));
      await evaluate('document.fonts.ready.then(()=>true)'); await sleep(250);
      // Hide only Next's development overlay in evidence, not application UI.
      await evaluate(`document.querySelectorAll('nextjs-portal').forEach(e => e.style.visibility = 'hidden')`);
      const metrics = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,marketplace:!!document.querySelector('[aria-label="Navegación principal"]'),shell:!!document.querySelector('.seller-sidebar'),nav:getComputedStyle(document.querySelector('.seller-mobile-nav')).display,body:document.body.innerText.includes('Haz crecer tu negocio con COMETA.')})`);
      assert.ok(metrics.scroll <= metrics.width, JSON.stringify(metrics)); assert.equal(metrics.marketplace, false); assert.equal(metrics.body, true);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: await evaluate('document.documentElement.scrollHeight'), scale: 1 } });
      fs.writeFileSync(`${output}/${state.toLowerCase()}-${device}.png`, Buffer.from(shot.data, 'base64'));
      if (device === 'phone') {
        const viewport = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(`${output}/${state.toLowerCase()}-phone-viewport.png`, Buffer.from(viewport.data, 'base64'));
      }
      if (device === 'phone') {
        await evaluate(`document.querySelector('.seller-mobile-nav button').click()`); await sleep(100); assert.equal(await evaluate(`document.querySelector('.seller-mobile-menu') !== null`), true);
        await evaluate(`document.querySelector('.seller-mobile-menu button').click()`);
      }
      results.push({ state, device, ...metrics }); console.log('PASS', state, device, metrics.width, metrics.scroll);
    }
    // Buyer surface keeps Marketplace chrome with the same authenticated identity.
    await send('Page.navigate', { url: 'http://localhost:3000/comu/account/buyer' });
    for (let i = 0; i < 60; i++) { if (await evaluate(`!!document.querySelector('[aria-label="Navegación principal"]')`)) break; await sleep(200); }
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="Navegación principal"]') && !document.querySelector('.seller-sidebar')`), true);
  }
  fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
} finally { if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); } chrome.kill(); }
