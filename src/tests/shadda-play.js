/* شدّة بالأثر: تُقاد الصفحة كما يقودها لاعب، ويُقرأ الحكم من الشاشة.
 *
 *   node src/tests/shadda-play.js
 *   … --port 8613
 *
 * لا تُقرأ حالةٌ داخلية ولا يُستدعى المحرّك من هنا إطلاقاً: كل ما يُسأل عنه
 * نصٌّ مرسومٌ على الشاشة — عناوين الأزرار، وبطاقات المقاعد، وسطور السجلّ.
 * فإن انفصل ما تعرضه الصفحة عمّا يفعله المحرّك سقط هذا الفحص، وهو الشيء
 * الوحيد الذي لا تمسكه فحوص src/tests/shadda.js.
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');

const REPO = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
let PORT = 8613;
const pi = args.indexOf('--port');
if (pi >= 0) { PORT = parseInt(args[pi + 1], 10); args.splice(pi, 2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let bad = 0;
function ok(name, cond, extra) {
  if (cond) console.log('PASS ' + name);
  else { bad++; console.log('FAIL ' + name + (extra === undefined ? '' : '  — ' + extra)); }
}

/* كل ما يلي يقرأ النصّ المرسوم وحده */
const texts = (p, sel) => p.$$eval(sel, es => es.map(e => e.textContent.trim()));
const logText = p => p.$eval('#log', e => e.innerText);
const capText = p => p.$eval('#cap-n', e => e.textContent.trim());
const hintText = p => p.$eval('#hint', e => e.textContent.trim());
const seatChips = p => texts(p, '#seats .seat');

async function clickByText(p, sel, want) {
  const els = await p.$$(sel);
  for (const e of els) {
    const t = (await e.textContent()).trim();
    if (t === want || (want instanceof RegExp && want.test(t))) { await e.click(); return t; }
  }
  return null;
}

/* دورٌ واحد: يُنظر إلى ما هو معروضٌ الآن ويُتصرّف كما يتصرّف لاعب */
async function oneMove(p) {
  const acts = await texts(p, '#acts button');
  if (acts.indexOf('أحمر') >= 0) { await clickByText(p, '#acts button', 'أحمر'); return 'colour'; }
  if (acts.indexOf('اعترض') >= 0) { await clickByText(p, '#acts button', 'اعترض'); return 'challenge'; }
  const live = await p.$$('#hand button:not([disabled])');
  if (live.length) { await live[0].click(); return 'play'; }
  if (acts.some(t => /^خذ /.test(t))) { await clickByText(p, '#acts button', /^خذ /); return 'take'; }
  if (acts.indexOf('اسحب') >= 0) { await clickByText(p, '#acts button', 'اسحب'); return 'draw'; }
  if (acts.indexOf('مرّر') >= 0) { await clickByText(p, '#acts button', 'مرّر'); return 'pass'; }
  return null;
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: REPO, stdio: 'ignore' });
  await sleep(1200);
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/shadda.html`, { waitUntil: 'load' });
    await sleep(600);

    /* ---- ما تعرضه الصفحة أوّل ما تُفتح ---- */
    ok('the page deals itself a round and says so', (await logText(p)).indexOf('وُزّعت 7 لكل لاعب') >= 0,
      (await logText(p)).slice(0, 80));
    let chips = await seatChips(p);
    ok('three seats are shown, each holding seven', chips.length === 3 && chips.every(t => / 7$| 7 /.test(t + ' ')),
      chips.join(' | '));
    ok('exactly one seat is marked as the one to act',
      (await p.$$('#seats .seat.now')).length === 1);
    ok('the hint names whose turn it is', /دورك/.test(await hintText(p)), await hintText(p));

    /* ---- جولةٌ كاملة بالنقر وحده ---- */
    let moves = 0, kinds = {};
    while (moves < 600) {
      if (/انتهت الجولة/.test(await logText(p))) break;
      const what = await oneMove(p);
      if (!what) break;
      kinds[what] = (kinds[what] || 0) + 1;
      moves++;
    }
    const log = await logText(p);
    const m = log.match(/انتهت الجولة: فاز (.+?) بـ(\d+) نقطة/);
    ok('a whole round is played through to a winner, by clicking only', !!m,
      moves + ' moves, last line: ' + log.split('\n').slice(-1)[0]);
    ok('the round took real play, not one lucky card', moves > 6, 'moves=' + moves + ' ' + JSON.stringify(kinds));
    if (m) {
      const cap = await capText(p);
      ok('the score on the bar matches the score in the log', cap.indexOf(m[2]) >= 0, cap + ' vs ' + m[2]);
      chips = await seatChips(p);
      /* بطاقة المقعد قد تحمل ✓ بعد العدد، وهي علامة من قال «واحدة» */
      ok('the winner is shown holding nothing', chips.some(t => / 0( ✓)?$/.test(t)), chips.join(' | '));
    }
    ok('the round offers a way on', (await texts(p, '#acts button')).indexOf('الجولة التالية') >= 0);
    await clickByText(p, '#acts button', 'الجولة التالية');
    await sleep(200);
    ok('the next round deals again and keeps the score',
      /— الجولة 2 —/.test(await logText(p)) && (await capText(p)).indexOf('round 2') >= 0,
      await capText(p));

    /* ---- «واحدة» منسيّة: نافذةُ النداء والعقوبة، من الشاشة ---- */
    await clickByText(p, '#setup button', 'واحدة تلقائياً');       // تُطفأ
    await clickByText(p, '#setup button', 'وزّع');
    await sleep(150);
    let called = false;
    for (let k = 0; k < 900 && !called; k++) {
      if (/انتهت الجولة/.test(await logText(p))) { await clickByText(p, '#acts button', 'الجولة التالية'); await sleep(120); }
      const acts = await texts(p, '#acts button');
      const call = acts.find(t => /^نادِ على /.test(t));
      if (call) { await clickByText(p, '#acts button', call); called = true; break; }
      if (!(await oneMove(p))) break;
    }
    ok('forgetting «واحدة» puts a call-out button on the screen', called);
    if (called) {
      ok('and the call-out is punished with two cards, in words on the screen',
        /عوقب بـ2/.test(await logText(p)), (await logText(p)).split('\n').slice(-2).join(' / '));
    }

    /* ---- من اثنين إلى خمسة: كل عددٍ يُوزَّع ويُلعب ---- */
    for (const n of ['2', '4', '5']) {
      await clickByText(p, '#setup button', n);
      await sleep(150);
      const chips2 = await seatChips(p);
      ok(n + ' players: that many seats appear', chips2.length === Number(n), chips2.join(' | '));
      let played = false;
      for (let k = 0; k < 40 && !played; k++) {
        const what = await oneMove(p);
        if (!what) break;
        if (what === 'play') played = true;
      }
      ok(n + ' players: a card can actually be played', played);
    }

    ok('nothing on the page threw at any point', errs.length === 0, errs[0]);
    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(bad ? '\n' + bad + ' FAILED' : '\nALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
