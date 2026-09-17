/* كل لعبة في games.json تفتح من الرفّ وتعمل.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node src/tests/launcher.js
 *   … --port 8612
 *
 * يقرأ السجلّ، ينقر كل بطاقة بدورها، ويتأكّد أن الصفحة حُمّلت داخل الإطار
 * وفيها لوحة رسم حيّة وأزرار، وأن الرجوع يغلق المشغّل. ولا يفترض عدد الألعاب:
 * أضف لعبة رابعة وسيختبرها من تلقائه.
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');

const REPO = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
let PORT = 8612;
const pi = args.indexOf('--port');
if (pi >= 0) { PORT = parseInt(args[pi + 1], 10); args.splice(pi, 2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: REPO, stdio: 'ignore' });
  await sleep(1200);
  let bad = 0;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await sleep(1200);
    const names = await p.evaluate(() => [...document.querySelectorAll('#list .tile .name')].map(e => e.textContent));
    console.log('the shelf shows: ' + names.join(' · '));
    for (let i = 1; i <= names.length; i++) {
      await p.click(`#list .tile:nth-child(${i})`);
      await p.waitForSelector('#frame', { timeout: 6000 });
      await sleep(2200);
      const info = await p.evaluate(() => {
        const f = document.getElementById('frame'); const d = f.contentDocument;
        if (!d) return { ok: false, why: 'the frame has no document' };
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const live = [...d.querySelectorAll('canvas')].filter(vis)
          .map(c => c.id + ':' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height));
        /* لعبة تُشغّل محرّكاً يحتاج ملفّات اللاعب لا لوح لها قبل أن يجلبها،
           فيقوم مقامه واجهة استقبال فيها زرّ ظاهر. الإعفاء يشترط الإعلان
           ‎body[data-needs-assets]‎ ووجود الزرّ معاً، فلا تمرّ صفحة فارغة. */
        const needs = d.body.dataset.needsAssets !== undefined;
        const intake = [...d.querySelectorAll('.sheet')].filter(sh => !sh.hidden && vis(sh))
          .reduce((n, sh) => n + [...sh.querySelectorAll('button')].filter(vis).length, 0);
        if (!live.length && needs && intake) return { ok: true, live: ['intake:' + intake + ' buttons'], buttons: d.querySelectorAll('button').length };
        if (!live.length && needs) return { ok: false, why: 'needs assets yet offers no way to supply them' };
        return { ok: !!live.length, live, buttons: d.querySelectorAll('button').length };
      });
      if (!info.ok) { bad++; console.log('FAIL ' + names[i - 1] + ': ' + (info.why || 'nothing drawn')); }
      else console.log('PASS ' + names[i - 1] + '  ' + info.live.join(' ') + '  buttons=' + info.buttons);
      await p.click('#back'); await sleep(600);
      const closed = await p.evaluate(() => document.getElementById('player').hidden && !document.querySelector('#frame'));
      if (!closed) { bad++; console.log('FAIL ' + names[i - 1] + ': the player did not close'); }
    }
    if (errs.length) { bad++; console.log('FAIL page errors: ' + errs[0]); }
    else console.log('PASS no page errors');
    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(bad ? bad + ' FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
