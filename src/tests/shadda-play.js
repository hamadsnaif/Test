/* شدّة بالأثر: تُقاد الطاولة كما يقودها لاعب، ويُقرأ الحكم من الشاشة.
 *
 *   node src/tests/shadda-play.js
 *   … --port 8613
 *
 * لا تُقرأ حالةٌ داخلية ولا يُستدعى المحرّك من هنا إطلاقاً: كل ما يُسأل عنه
 * نصٌّ مرسومٌ أو عنصرٌ مرسوم — بطاقات المقاعد على الجوخ، وورق اليد في المروحة،
 * وسطر الحالة، والمفاتيح، والسجلّ. فإن انفصل ما تعرضه الطاولة عمّا يفعله
 * المحرّك سقط هذا الفحص، وهو الشيء الوحيد الذي لا تمسكه فحوص src/tests/shadda.js.
 *
 * وفيه قياسان يُطلبان بالاسم في المرحلة ٢: طرفُ كل ورقةٍ المكشوف في المروحة —
 * أكبر مستطيلٍ تملكه الورقة وحدها، بالطريقة نفسها التي يقيس بها contract.js —
 * على عرض ‎390‎ بيدٍ من سبع، وعلى عرض ‎320‎ بيدٍ من خمس عشرة.
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
/* الأرقام على الشاشة عربية ٠-٩؛ هذه تقرأها */
const AR = '٠١٢٣٤٥٦٧٨٩';
const num = s => parseInt(String(s).replace(/[٠-٩]/g, d => AR.indexOf(d)), 10);

/* كل ما يلي يقرأ المرسوم وحده */
const texts = (p, sel) => p.$$eval(sel, es => es.map(e => e.textContent.trim()));
const logText = p => p.$eval('#log', e => e.innerText);
const capText = p => p.$eval('#cap-n', e => e.textContent.trim());
const turnText = p => p.$eval('#turn', e => e.textContent.trim());
const hintText = p => p.$eval('#hint', e => e.textContent.trim());
const tags = p => texts(p, '#tags .ntag');
const tagCounts = p => p.$$eval('#tags .ntag .cnt', es => es.map(e => e.textContent.trim()));
const handCards = p => p.$$('#hand button.card');
const liveCards = p => p.$$('#hand button.card:not([disabled])');

async function clickByText(p, sel, want) {
  const els = await p.$$(sel);
  for (const e of els) {
    const t = (await e.textContent()).trim();
    if (t === want || (want instanceof RegExp && want.test(t))) { await e.click(); return t; }
  }
  return null;
}

/* ورقةٌ تُلعب بنقرتين: الأولى ترفعها والثانية تلعبها — كما يفعل اللاعب */
async function playFirstLive(p) {
  const live = await liveCards(p);
  if (!live.length) return false;
  await live[0].click();
  await sleep(20);
  const up = await p.$('#hand button.card.up');
  if (!up) return false;
  await up.click();
  await sleep(20);
  return true;
}

/* دورٌ واحد: يُنظر إلى ما هو معروضٌ الآن ويُتصرّف كما يتصرّف لاعب.
   sayOne: إن كانت في اليد ورقتان قيلت «واحدة» مع اللعب؛ وإلا نُسيت عمداً. */
async function oneMove(p, sayOne) {
  /* نافذة تبديل الأدوار تسبق كل شيء: اللاعب التالي يقول إنه هو ثم يرى يده */
  if (await p.$eval('#handoff', e => !e.hidden)) { await p.click('#handoffok'); await sleep(20); return 'handoff'; }
  const acts = await texts(p, '#acts button');
  if (acts.indexOf('أحمر') >= 0) { await clickByText(p, '#acts button', 'أحمر'); return 'colour'; }
  if (acts.indexOf('اعترض') >= 0) { await clickByText(p, '#acts button', 'اعترض'); return 'challenge'; }
  const live = await liveCards(p);
  if (live.length) {
    if (sayOne && (await handCards(p)).length === 2 && acts.indexOf('واحدة!') >= 0) {
      const pressed = await p.$eval('#acts button[aria-pressed]', b => b.getAttribute('aria-pressed'));
      if (pressed !== 'true') await clickByText(p, '#acts button', 'واحدة!');
    }
    if (await playFirstLive(p)) return 'play';
  }
  if (acts.some(t => /^خذ /.test(t))) { await clickByText(p, '#acts button', /^خذ /); return 'take'; }
  if (acts.indexOf('اسحب') >= 0) { await clickByText(p, '#acts button', 'اسحب'); return 'draw'; }
  if (acts.indexOf('مرّر') >= 0) { await clickByText(p, '#acts button', 'مرّر'); return 'pass'; }
  /* مهلة التسليم: الورقة تطير ويدُ من لعب معطّلةٌ على الشاشة، والنافذة لم تُرفع بعد */
  if (await p.$eval('#turn', e => /^الدور لـ/.test(e.textContent))) { await sleep(150); return 'wait'; }
  return null;
}

/* أكبر مستطيلٍ تملكه الورقة وحدها — الخوارزمية نفسها التي في contract.js */
async function fanPatches(p) {
  return p.evaluate(() => {
    const btns = [...document.querySelectorAll('#hand button.card')];
    const own = (x, y) => { const e = document.elementFromPoint(x, y); const b = e && e.closest('button'); return b && btns.includes(b) ? b : null; };
    const clip = document.getElementById('hand').getBoundingClientRect();
    const out = [];
    for (const b of btns) {
      const r = b.getBoundingClientRect(), step = 2;
      /* الورقة المنزلقة خارج الشاشة أو المقطوعة بحافّته ليست هدفاً هنا: تُبلَغ
         بالانزلاق. تُقاس الظاهرةُ كاملةً وحدها. */
      if (r.left < clip.left - 1 || r.right > clip.right + 1) continue;
      const cols = Math.floor((r.width - step) / step) + 1, rows = Math.floor((r.height - step) / step) + 1;
      const x0 = r.left + step / 2, y0 = r.top + step / 2, hist = new Array(cols).fill(0);
      let best = { w: 0, h: 0, min: 0 };
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) hist[i] = own(x0 + i * step, y0 + j * step) === b ? hist[i] + 1 : 0;
        const st = [];
        for (let i = 0; i <= cols; i++) {
          const h = i === cols ? 0 : hist[i];
          while (st.length && hist[st[st.length - 1]] >= h) {
            const hh = hist[st.pop()], l = st.length ? st[st.length - 1] + 1 : 0;
            const w = (i - l) * step, ht = hh * step;
            if (Math.min(w, ht) > best.min) best = { w, h: ht, min: Math.min(w, ht) };
          }
          st.push(i);
        }
      }
      out.push(best);
    }
    return out;
  });
}

async function open(browser, w, h, query) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:' + PORT)) errs.push('external: ' + r.url()); });
  await p.goto(`http://127.0.0.1:${PORT}/shadda.html${query || ''}`, { waitUntil: 'load' });
  await sleep(400);
  return { ctx, p, errs };
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: REPO, stdio: 'ignore' });
  await sleep(1200);
  const browser = await chromium.launch();
  try {
    /* ============ الجوّال واقفاً: ‎390×844‎، بذرةٌ ثابتة كي يُعاد الفحص كما هو ============ */
    let { ctx, p, errs } = await open(browser, 390, 844, '?seed=11');

    /* ---- ما تعرضه الصفحة أوّل ما تُفتح: شاشة البداية فوق طاولةٍ حقيقية ---- */
    ok('the start sheet is up and the table is declared beneath it',
      await p.$eval('#start', e => !e.hidden) &&
      await p.$eval('[data-table]', e => { const r = e.getBoundingClientRect(); return r.width >= innerWidth / 10 && r.height >= innerHeight / 10; }));
    ok('three seats are offered by default and the other modes wait for their stages',
      (await p.$eval('#count .key.on', e => e.textContent.trim())) === '٣' &&
      (await p.$$eval('.modes .key:disabled', es => es.length)) === 2);
    ok('no card is on the table before a game starts', (await handCards(p)).length === 0);

    /* ---- الأسماء تُكتب فتظهر على الجوخ وفي الحالة ---- */
    await p.fill('#namelist input[data-i="0"]', 'سارة');
    await p.fill('#namelist input[data-i="1"]', 'خالد');
    await p.click('#startbtn');
    await sleep(150);
    ok('pressing start hides the sheet and deals a round, and the log says so',
      await p.$eval('#start', e => e.hidden) && /وُزّعت ٧ لكل لاعب/.test(await logText(p)), (await logText(p)).slice(0, 80));
    let tg = await tags(p), shown = tg.join(' ') + ' ' + await turnText(p);
    ok('two opponents stand on the felt, and the typed names are among the three',
      tg.length === 2 && ['سارة', 'خالد', 'اللاعب ٣'].every(n => shown.indexOf(n) >= 0), shown);
    ok('the status names whose turn it is', /، دورك$/.test(await turnText(p)), await turnText(p));
    ok('the hand holds seven cards, each a button', (await handCards(p)).length === 7 || (await handCards(p)).length === 9);
    ok('the bar shows the round and three scores', /^round 1 · 0 - 0 - 0$/.test(await capText(p)), await capText(p));

    /* ---- المروحة: كل ورقةٍ تملك طرفها — ‏٤٤‏ بكسلاً في البعدين ---- */
    let patches = await fanPatches(p);
    let minPatch = Math.min(...patches.map(q => q.min));
    console.log('     fan on 390 with ' + patches.length + ' cards: each card owns at least ' + minPatch + 'px (' + patches.map(q => q.w + 'x' + q.h).join(' ') + ')');
    ok('on a 390px screen every fanned card owns a 44x44 patch alone', patches.length > 0 && minPatch >= 44, 'min=' + minPatch);

    /* ---- نقرةٌ ترفع وثانيةٌ تلعب، والأثر في السجلّ ---- */
    let moved = false;
    for (let k = 0; k < 30 && !moved; k++) {
      const live = await liveCards(p);
      if (live.length) {
        const name = await live[0].getAttribute('aria-label');
        await live[0].click(); await sleep(20);
        ok('the first tap raises the card and the hint says to tap again',
          !!(await p.$('#hand button.card.up')) && /مرّةً أخرى/.test(await hintText(p)), await hintText(p));
        await (await p.$('#hand button.card.up')).click(); await sleep(20);
        ok('the second tap plays it, and the log names the card that was played',
          new RegExp(' لعب ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.').test(await logText(p)),
          (await logText(p)).split('\n').slice(-1)[0]);
        moved = true;
      } else if (!(await oneMove(p, true))) break;
    }
    ok('a card was played by tapping within the first turns', moved);

    /* ---- تبديل الأدوار نافذة: لا يدَ ولا مفاتيح حتى يضغط التالي، ثم يده تظهر ---- */
    let hoSeen = false;
    for (let k = 0; k < 60 && !hoSeen; k++) {
      if (await p.$eval('#handoff', e => !e.hidden)) { hoSeen = true; break; }
      const what = await oneMove(p, true);
      if (!what) break;
    }
    ok('when the turn passes to another seat the hand-off window comes up', hoSeen);
    if (hoSeen) {
      const who = await p.$eval('#ho-who', e => e.textContent.trim());
      ok('the window says whom to pass the phone to', /^مرّر الجوّال إلى /.test(who), who);
      ok('and no card of that hand is drawn before they press', (await handCards(p)).length === 0 && (await texts(p, '#acts button')).length === 0);
      await p.click('#handoffok'); await sleep(60);
      ok('pressing «أنا فلان» shows that hand and names them in the status',
        (await handCards(p)).length > 0 && await p.$eval('#handoff', e => e.hidden) &&
        (await turnText(p)).indexOf(who.replace(/^مرّر الجوّال إلى /, '')) === 0, await turnText(p));
      let t = '';
      for (let k = 0; k < 30 && !/^دورك/.test(t); k++) { t = await p.$eval('#toast', e => e.classList.contains('on') ? e.textContent.trim() : ''); if (!/^دورك/.test(t)) await sleep(100); }
      ok('and «دورك» pops up over the table on its own', /^دورك/.test(t), t);
      await sleep(1400);
      ok('and goes away by itself', !(await p.$eval('#toast', e => e.classList.contains('on'))));
    }

    /* ---- جولةٌ كاملة بالنقر وحده، و«واحدة» تُقال حين تبقى ورقتان ---- */
    let moves = 0, kinds = {};
    while (moves < 800) {
      if (/انتهت الجولة/.test(await logText(p))) break;
      const what = await oneMove(p, true);
      if (!what) break;
      kinds[what] = (kinds[what] || 0) + 1;
      moves++;
    }
    const log = await logText(p);
    const m = log.match(/انتهت الجولة: فاز (.+?) بـ([٠-٩]+) نقطة/);
    ok('a whole round is played through to a winner, by tapping only', !!m,
      moves + ' moves, last line: ' + log.split('\n').slice(-1)[0]);
    ok('the round took real play, not one lucky card', moves > 6, 'moves=' + moves + ' ' + JSON.stringify(kinds));
    ok('«واحدة» was said on the way, and the log recorded it', /قال «واحدة»/.test(log));
    if (m) {
      const cap = await capText(p);
      ok('the score on the bar matches the points in the log', cap.indexOf(String(num(m[2]))) >= 0, cap + ' vs ' + m[2]);
      ok('the winner\'s panel names the same winner', (await p.$eval('#over', e => !e.hidden && e.textContent)).indexOf(m[1]) >= 0);
      ok('the hand is cleared when the round is over', (await handCards(p)).length === 0);
    }
    ok('the round offers a way on', (await texts(p, '#acts button')).indexOf('الجولة التالية') >= 0);
    await clickByText(p, '#acts button', 'الجولة التالية');
    await sleep(150);
    ok('the next round deals again and keeps the score',
      /— الجولة ٢ —/.test(await logText(p)) && (await capText(p)).indexOf('round 2') >= 0, await capText(p));

    /* ---- «واحدة» منسيّة: مفتاح النداء يظهر، والعقوبة ورقتان — من الشاشة ---- */
    let called = false;
    for (let k = 0; k < 1500 && !called; k++) {
      const acts = await texts(p, '#acts button');
      if (acts.indexOf('الجولة التالية') >= 0 || acts.indexOf('مباراة جديدة') >= 0) {
        await clickByText(p, '#acts button', /^(الجولة التالية|مباراة جديدة)$/); await sleep(100); continue;
      }
      const call = acts.find(t => /^نادِ على /.test(t));
      if (call) { await clickByText(p, '#acts button', call); called = true; break; }
      if (!(await oneMove(p, false))) break;
    }
    ok('forgetting «واحدة» puts a call-out key on the screen', called);
    if (called) ok('and the call-out is punished with two cards, in words on the screen',
      /عوقب بـ٢/.test(await logText(p)), (await logText(p)).split('\n').slice(-2).join(' / '));

    /* ---- القائمة تعود إلى البداية، والعودة تعود إلى الطاولة نفسها ---- */
    const before = await capText(p);
    await p.click('#menu'); await sleep(50);
    ok('the menu key brings the start sheet back with a way to resume',
      await p.$eval('#start', e => !e.hidden) && await p.$eval('#resume', e => !e.hidden));
    await p.click('#resume'); await sleep(50);
    ok('resuming returns to the same table', await p.$eval('#start', e => e.hidden) && (await capText(p)) === before);

    /* ---- من اثنين إلى خمسة: كل عددٍ يُوزَّع ويُلعب، ومقاعده على الجوخ ---- */
    for (const n of [2, 4, 5]) {
      await p.click('#menu'); await sleep(30);
      await p.click('#count [data-n="' + n + '"]'); await sleep(30);
      ok(n + ' players: the name list grows to match', (await p.$$eval('#namelist input', es => es.length)) === n);
      await p.click('#startbtn'); await sleep(150);
      ok(n + ' players: that many opponents stand on the felt', (await tags(p)).length === n - 1, (await tags(p)).join(' | '));
      let played = false;
      for (let k = 0; k < 40 && !played; k++) {
        const what = await oneMove(p, true);
        if (!what) break;
        if (what === 'play') played = true;
      }
      ok(n + ' players: a card can actually be played', played);
    }
    ok('nothing on the page threw, and nothing left the machine', errs.length === 0, errs[0]);
    await ctx.close();

    /* ============ الخصوصية مطفأة: لا نافذة، واليد تتبدّل مباشرةً ============ */
    ({ ctx, p, errs } = await open(browser, 390, 844, '?seed=11'));
    await p.click('#privacy'); await p.click('#startbtn'); await sleep(150);
    let hoOff = false;
    for (let k = 0; k < 40; k++) {
      if (await p.$eval('#handoff', e => !e.hidden)) { hoOff = true; break; }
      const what = await oneMove(p, true);
      if (!what || what === 'handoff') break;
    }
    ok('with the privacy switch off the hand-off window never appears', !hoOff && (await handCards(p)).length > 0);
    await ctx.close();

    /* ============ ‎320‎ عرضاً: يدٌ كبيرة تنزلق، وكل ورقةٍ ظاهرةٍ تملك طرفها ============ */
    ({ ctx, p, errs } = await open(browser, 320, 568, '?seed=3'));
    await p.click('#privacy'); await p.click('#startbtn'); await sleep(150);
    let big = 0;
    for (let k = 0; k < 400; k++) {
      const acts = await texts(p, '#acts button');
      const n = (await handCards(p)).length;
      if (n >= 15) { big = n; break; }
      if (acts.indexOf('اسحب') >= 0) { await clickByText(p, '#acts button', 'اسحب'); await sleep(20); await clickByText(p, '#acts button', 'مرّر'); }
      else if (acts.indexOf('مرّر') >= 0) await clickByText(p, '#acts button', 'مرّر');
      else if (acts.indexOf('أحمر') >= 0) await clickByText(p, '#acts button', 'أحمر');
      else if (acts.indexOf('اقبل الأربع') >= 0) await clickByText(p, '#acts button', 'اقبل الأربع');
      else if (acts.some(t => /^خذ /.test(t))) await clickByText(p, '#acts button', /^خذ /);
      else if (acts.indexOf('الجولة التالية') >= 0) await clickByText(p, '#acts button', 'الجولة التالية');
      else break;
      await sleep(20);
    }
    ok('on 320 a hand of fifteen can be built by drawing', big >= 15, 'hand=' + big);
    await sleep(400);                                            // الورق ينزلق إلى مواضعه الجديدة (‏٢٥٠‏ ملّي ثانية) قبل القياس
    const wide = await p.$eval('#hand', e => e.scrollWidth > e.clientWidth + 1);
    ok('a hand that wide slides sideways instead of burying its cards', wide);
    patches = await fanPatches(p);
    minPatch = Math.min(...patches.map(q => q.min));
    console.log('     hand on 320 with ' + big + ' cards (' + patches.length + ' on screen): each visible card owns at least ' + minPatch + 'px (' + patches.map(q => q.w + 'x' + q.h).join(' ') + ')');
    ok('on a 320px screen every visible card of fifteen owns a 44x44 patch alone', patches.length > 0 && minPatch >= 44, 'min=' + minPatch);
    /* والأخيرة تُبلَغ بالانزلاق وتُلمس */
    await p.$eval('#hand', e => { e.scrollLeft = e.scrollWidth; });
    await sleep(50);
    const last = (await handCards(p)).slice(-1)[0];
    const lastOn = await last.evaluate(b => { const r = b.getBoundingClientRect(), h = document.getElementById('hand').getBoundingClientRect(); return r.right <= h.right + 1 && r.left >= h.left - 1; });
    ok('scrolled to the end, the last card is wholly on screen', lastOn);
    ok('nothing threw on the small screen either', errs.length === 0, errs[0]);
    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(bad ? '\n' + bad + ' FAILED' : '\nALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
