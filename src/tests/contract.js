/* العقد الذي تلتزم به كل صفحة لعبة في المجموعة.
 *
 *   node src/tests/contract.js bounce.html snake.html tetris.html
 *   node src/tests/contract.js --port 8611 mygame.html
 *
 * يشغّل خادماً على جذر المستودع ثم يفتح كل صفحة على عشرة مقاسات: خمسة أجهزة،
 * وخمسة مثلها أقصر بخمسين بكسلاً تحاكي إطار المشغّل. يطبع جدولاً ويخرج بصفر
 * إن نجح الكل. يحتاج Playwright:
 *   NODE_PATH=/opt/node22/lib/node_modules node src/tests/contract.js …
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');

const REPO = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
let PORT = 8611;
const pi = args.indexOf('--port');
if (pi >= 0) { PORT = parseInt(args[pi + 1], 10); args.splice(pi, 2); }
const PAGES = args.length ? args : ['bounce.html', 'snake.html', 'tetris.html'];

const VIEWS = [
  ['iPhone12', 390, 844, 3], ['SE', 375, 667, 2], ['w320', 320, 568, 2],
  ['landscape', 844, 390, 3], ['desktop', 900, 700, 1],
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: REPO, stdio: 'ignore' });
  await sleep(1200);
  let bad = 0;
  const browser = await chromium.launch();
  try {
    for (const page of PAGES) {
      console.log('\n=== ' + page);
      for (const [name, w, h, dpr] of VIEWS) {
        for (const framed of [false, true]) {
          const vh = framed ? h - 50 : h;
          const ctx = await browser.newContext({
            viewport: { width: w, height: vh }, deviceScaleFactor: dpr,
            hasTouch: true, isMobile: true,
          });
          const p = await ctx.newPage();
          const errs = [], ext = [];
          p.on('pageerror', e => errs.push(e.message));
          p.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:' + PORT)) ext.push(r.url()); });
          await p.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: 'load' });
          await sleep(1200);
          const m = await p.evaluate(() => {
            const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
            const keys = [...document.querySelectorAll('button')].filter(vis)
              .map(e => ({ id: e.id || e.className.split(' ')[0], min: Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)) }));
            const canvases = [...document.querySelectorAll('canvas')].filter(vis)
              .map(c => c.id + ':' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height));
            const rows = ['.cap', '.deck', '.pads', '.field', '.top'].map(s => document.querySelector(s))
              .filter(Boolean).map(e => getComputedStyle(e).direction);
            return {
              ovX: document.documentElement.scrollWidth > innerWidth + 1,
              ovY: document.documentElement.scrollHeight > innerHeight + 1,
              small: keys.filter(k => k.min < 44),
              canvases, rows,
              layers: getComputedStyle(document.body).backgroundImage.split('gradient').length - 1,
            };
          });
          const rm = await ctx.newPage();
          await rm.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: 'load' });
          const label = (name + (framed ? '_f' : '')).padEnd(12);
          const fails = [];
          if (m.ovX) fails.push('overflows sideways');
          if (m.ovY) fails.push('overflows down');
          if (m.small.length) fails.push('under 44: ' + m.small.map(k => k.id + ':' + k.min).join(' '));
          if (errs.length) fails.push('page error: ' + errs[0]);
          if (ext.length) fails.push('external request: ' + ext[0]);
          if (!m.canvases.length) fails.push('no visible canvas');
          if (m.rows.some(d => d !== 'ltr')) fails.push('a physical row is not ltr');
          if (m.layers < 2) fails.push('the page background is a flat colour');
          if (fails.length) { bad++; console.log('FAIL ' + label + fails.join(' | ')); }
          else console.log('PASS ' + label + m.canvases.join(' '));
          await ctx.close();
        }
      }
    }
    // الحركة تحترم تفضيل النظام
    for (const page of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      await p.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: 'load' });
      await sleep(900);
      const n = await p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
      if (n) { bad++; console.log('FAIL reduced motion: ' + page + ' still runs ' + n + ' animation(s)'); }
      else console.log('PASS reduced motion: ' + page);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(bad ? '\n' + bad + ' FAILED' : '\nALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
