// Records the live demo: drives the real inspector (real clicks, real `ask` calls) and the terminal player,
// saving every screencast frame with its timestamp plus scene markers for assembly.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';

const DIR = new URL('.', import.meta.url).pathname;
const FRAMES = `${DIR}frames`;
rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true });
const RUN = 'small-models-v1-run-1';
const INSPECTOR = `http://127.0.0.1:4700/?run=${RUN}`;
const BRIEF = `http://127.0.0.1:4700/briefs/${RUN}-brief.html`;
const narration = JSON.parse(readFileSync(`${DIR}narration.json`, 'utf8'));
const dur = id => Number(execFileSync('afinfo', [`${DIR}seg-${id}.aiff`]).toString().match(/estimated duration: ([\d.]+)/)[1]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9334',
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${DIR}chrome-profile`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map();
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, m => m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const frames = []; let recording = false; let frameNo = 0;
const evaluate = async expression => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

// Overlay injected into every page: a cursor with click ripples and a caption strip. Pure presentation.
const OVERLAY = `(() => {
  if (window.__ov) return; window.__ov = true;
  const boot = () => {
    const st = document.createElement('style');
    st.textContent = '#__cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:transform var(--d,700ms) cubic-bezier(.45,.05,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}' +
      '.__rip{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #e0a24b;z-index:2147483646;pointer-events:none;animation:__r .6s ease-out forwards}' +
      '@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}' +
      '#__cap{position:fixed;left:24px;bottom:18px;z-index:2147483645;font:600 15px/1.2 "JetBrains Mono",ui-monospace,Menlo,monospace;color:#f2f4f8;background:rgba(9,14,24,.86);border:1px solid rgba(224,162,75,.6);padding:9px 14px;border-radius:8px;letter-spacing:.02em;transition:opacity .3s}';
    document.documentElement.appendChild(st);
    const cur = document.createElement('div'); cur.id = '__cur';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.6-7.4L21 11z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    cur.style.transform = 'translate(' + (window.__cx ?? 900) + 'px,' + (window.__cy ?? 500) + 'px)';
    document.documentElement.appendChild(cur);
    const cap = document.createElement('div'); cap.id = '__cap'; cap.style.opacity = 0; document.documentElement.appendChild(cap);
  };
  if (document.documentElement) boot(); else document.addEventListener('DOMContentLoaded', boot);
  window.__caption = t => { const c = document.getElementById('__cap'); c.textContent = t; c.style.opacity = t ? 1 : 0; };
  window.__cursorTo = (x, y, ms) => { const c = document.getElementById('__cur'); c.style.setProperty('--d', ms + 'ms'); c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; window.__cx = x; window.__cy = y; };
  window.__ripple = (x, y) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); };
  window.__hideCursor = h => { const c = document.getElementById('__cur'); if (c) c.style.opacity = h ? 0 : 1; };
})()`;

async function center(selector) {
  return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: Math.round(r.left + Math.min(r.width / 2, 120)), y: Math.round(r.top + r.height / 2), top: r.top, bottom: r.bottom }; })()`);
}
async function moveTo(selector, ms = 800) {
  const c = await center(selector); if (!c) throw new Error(`missing ${selector}`);
  await evaluate(`__cursorTo(${c.x}, ${c.y}, ${ms})`); await sleep(ms + 80); return c;
}
async function click(selector, ms = 800) {
  const c = await moveTo(selector, ms);
  await evaluate(`__ripple(${c.x}, ${c.y}); document.querySelector(${JSON.stringify(selector)}).click()`); await sleep(350);
}
async function scrollTo(selector, block = 'center', ms = 1100) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ behavior: 'smooth', block: '${block}' })`); await sleep(ms);
}
// Scroll so an element's top sits just below the inspector's sticky header.
async function scrollBelowHeader(selector, offset = 76, ms = 1200) {
  await evaluate(`window.scrollTo({ top: document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top + scrollY - ${offset}, behavior: 'smooth' })`); await sleep(ms);
}
async function type(selector, text) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.value = ''; })()`);
  for (const ch of text) { await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value += ${JSON.stringify(ch)}; })()`); await sleep(38); }
}
async function waitFor(expression, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (await evaluate(expression)) return; await sleep(200); }
  throw new Error(`timed out waiting for ${label}`);
}
async function navigate(url, readyExpr) {
  await cdp('Page.navigate', { url }); await sleep(600);
  if (readyExpr) await waitFor(readyExpr, 30_000, `load ${url}`);
  await sleep(800);
}

const scenes = [];
async function scene(sceneId, body) {
  const n = narration.find(s => s.id === sceneId);
  const start = Date.now() / 1000; recording = true;
  await evaluate(`__caption(${JSON.stringify(n.caption)})`);
  const at = async sec => { const w = start + sec - Date.now() / 1000; if (w > 0) await sleep(w * 1000); };
  await body(at);
  await at(dur(sceneId) + 0.7);            // the scene lasts at least as long as its narration
  scenes.push({ id: sceneId, start, end: Date.now() / 1000 }); recording = false;
  console.log(`scene ${sceneId}: ${(Date.now() / 1000 - start).toFixed(1)}s`);
}

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch('http://127.0.0.1:9334/json/list')).json()).find(t => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Page.screencastFrame') {
      ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
      if (recording) { const file = `f${String(frameNo++).padStart(6, '0')}.jpg`; writeFileSync(`${FRAMES}/${file}`, Buffer.from(m.params.data, 'base64')); frames.push({ file, t: m.params.metadata.timestamp }); }
    }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: OVERLAY });
  await cdp('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

  // Terminal: replay of the captured real session (real commands, output and timings).
  await navigate(`file://${DIR}terminal.html`, 'typeof window.__play === "function"');
  await evaluate('__hideCursor(true)');
  await scene('terminal', async at => { await evaluate('__play(); true'); await waitFor('window.__done === true', 60_000, 'terminal replay'); await at(0); });

  // Live inspector over the real run.
  await navigate(INSPECTOR, `!!document.querySelector('button.cell[title="LFM2.5-2.6B | context length"]')`);
  await evaluate('window.scrollTo(0, 0); __cursorTo(1150, 120, 10)');
  await scene('overview', async at => {
    await at(2.0); await moveTo('button.cell[title="LFM2.5-2.6B | context length"]', 1200);
    await at(6.5); await moveTo('button.cell[title="Phi-4-mini | parameter count"]', 1300);
    await at(10.0); await moveTo('button.cell[title="Llama-3.2-3B | license"]', 1300);
  });
  await scene('evidence', async at => {
    await at(0.5); await click('button.cell[title="LFM2.5-2.6B | context length"]');
    await at(3.5); await moveTo('#detail .ev', 1100);
    await at(7.5); await moveTo('#detail .ev:nth-of-type(2)', 900).catch(() => {});
  });
  await scene('contradictions', async at => {
    await at(0.3); await click('button.cell[title="Gemma-3-4B | context length"]');
    await at(4.0); await moveTo('#detail .ev', 900);
    await at(13.2); await click('button.cell[title="Qwen3-4B | context length"]');
    await at(18.0); await moveTo('#detail .reason', 900);
    await at(23.0); await moveTo('#detail .dec.old', 900).catch(() => {});
  });
  await scene('ask1', async at => {
    await at(0.2); await scrollTo('.tabs', 'start', 1200);
    await click('[data-tab="ask"]', 700);
    await type('#question', 'Why is the Gemma-3-4B context length unresolved?');
    await click('#ask', 600);
    await waitFor(`/Verified|withheld|Ask failed/.test(document.getElementById('answer').textContent)`, 60_000, 'verified answer');
    await sleep(400); await scrollBelowHeader('#answer'); await moveTo('#answer .answer-text', 900);
  });
  await scene('ask2', async at => {
    await scrollTo('.tabs', 'start', 1000);
    await type('#question', 'What failed during this run, and was it retried?');
    await click('#ask', 600);
    await waitFor(`/withheld|Verified|Ask failed/.test(document.getElementById('answer').textContent) && !/Retrieving/.test(document.getElementById('answer').textContent)`, 60_000, 'second answer');
    await sleep(400); await scrollBelowHeader('#answer'); await moveTo('#answer .verdict', 900);
  });

  // The brief (served by the inspector from exports/).
  await navigate(BRIEF, 'document.readyState === "complete"');
  await evaluate('__hideCursor(true); window.scrollTo(0, 0)');
  await scene('brief', async at => {
    await at(2.0); await evaluate(`window.scrollTo({ top: document.querySelector('h2').offsetTop - 30, behavior: 'smooth' })`);
    await at(6.0); await evaluate(`window.scrollTo({ top: [...document.querySelectorAll('h2')].find(h => /uncertain/.test(h.textContent)).offsetTop - 30, behavior: 'smooth' })`);
    await at(11.0); await evaluate(`window.scrollTo({ top: 0, behavior: 'smooth' })`);
  });
  await cdp('Page.stopScreencast');
  writeFileSync(`${DIR}recording.json`, JSON.stringify({ scenes, frames }, null, 1));
  console.log(JSON.stringify({ frames: frames.length, scenes: scenes.map(s => `${s.id} ${(s.end - s.start).toFixed(1)}s`) }));
  ws.close();
} finally { chrome.kill(); }
