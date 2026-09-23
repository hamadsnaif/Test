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
 * والأونلاين يُقاد كلُّه بـ‎?net=loop‎: طبقة النقل وحدها تُستبدل بقناةٍ بين
 * تبويبات الجهاز، وما فوقها — الغرفة والمقاعد والثقة واللقطات ورؤية كل مقعد —
 * هو هو. فلا يحتاج هذا الفحص شبكةً ولا يخرج منه طلبٌ واحد.
 *
 *   node src/tests/shadda-play.js --rtc
 *
 * يضيف قسماً أخيراً يقود غرفةً على **WebRTC حقيقي** عبر وسيط التوقيع العام:
 * سياقان منفصلان، ندّان حقيقيّان، وقناةُ بيانات تُفتح فعلاً. وهو **مطفأٌ
 * افتراضياً** لأنه يحتاج إنترنت، ولأن بقيّة هذا الملفّ تشترط ألّا يخرج طلبٌ
 * واحد من الجهاز — فلا يُخلط الشرطان.
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
const RTC = args.indexOf('--rtc') >= 0;
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
const overText = p => p.$eval('#over', e => e.hidden ? '' : e.innerText);
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
      if (await playFirstLive(p)) return 'one';
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

/* الغرفة تُقاد في **سياقٍ واحد**: BroadcastChannel لا يعبر بين سياقَي
   Playwright — لكلٍّ تخزينه — فتبويبات اللاعبين تُفتح في السياق نفسه. */
async function openIn(ctx, query, sink) {
  const p = await ctx.newPage();
  p.on('pageerror', e => sink.push(e.message));
  p.on('console', m => { if (m.type() === 'error') sink.push('console: ' + m.text()); });
  p.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:' + PORT)) sink.push('external: ' + r.url()); });
  await p.goto(`http://127.0.0.1:${PORT}/shadda.html${query || ''}`, { waitUntil: 'load' });
  await sleep(400);
  return p;
}
/* الضيف بعد فعله يُعطَّل حتى يصل حكم المضيف: لا تُنقر مفاتيحُه وهي معطّلة */
async function settled(p) {
  for (let i = 0; i < 60; i++) {
    const acts = await p.$$eval('#acts button', es => es.map(b => b.disabled));
    if (!acts.length || acts.some(d => !d) || (await liveCards(p)).length) return true;
    await sleep(60);
  }
  return false;
}
/* على أيّ جهازٍ يقع الفعل الآن؟ الحالة الكبيرة تقولها بثلاث صيغ لا بواحدة:
   «فلان، دورك» في اللعب، و«فلان، اختر اللون» بعد ورقةٍ حرّة، و«فلان، «سحب
   أربعة» عليك» عند الاعتراض. وقياسُ الأولى وحدها يترك الغرفة تقف على مقعدٍ
   مفاتيحُه أمامه — وهو ما ظنّه هذا الملفّ عطباً في الغرفة وليس فيه. */
const ACTS_HERE = /، دورك$|، اختر اللون$|عليك$/;
/* دورٌ واحد على أي تبويبٍ يقع عليه الفعل — كما يفعل اللاعب على جهازه هو.
   وإن انتهت الجولة فلا أحد يحمل دوراً: من يملك المفتاح يمضي بها، وإلا وقف
   كلُّ حلقةٍ تقود الغرفة عند أول جولةٍ تنتهي. */
async function roomMove(pages, sayOne) {
  for (const p of pages) {
    if (!ACTS_HERE.test(await turnText(p))) continue;
    if (!(await settled(p))) return { p, what: 'stuck' };
    return { p, what: await oneMove(p, sayOne) };
  }
  for (const p of pages) {
    const acts = await texts(p, '#acts button');
    if (acts.some(x => /^(الجولة التالية|مباراة جديدة)$/.test(x))) {
      await clickByText(p, '#acts button', /^(الجولة التالية|مباراة جديدة)$/);
      return { p, what: 'nextRound' };
    }
  }
  return null;
}
const rosterText = p => p.$eval('#roster', e => e.innerText.replace(/\s+/g, ' ').trim());

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
    ok('three seats are offered by default, and no mode is shut any more',
      (await p.$eval('#count .key.on', e => e.textContent.trim())) === '٣' &&
      (await p.$$eval('.modes .key:disabled', es => es.length)) === 0);
    ok('no card is on the table before a game starts', (await handCards(p)).length === 0);

    /* ---- الأسماء تُكتب فتظهر على الجوخ وفي الحالة ---- */
    await p.fill('#namelist input[data-i="0"]', 'سارة');
    await p.fill('#namelist input[data-i="1"]', 'خالد');
    await p.click('#startbtn');
    await sleep(150);
    ok('pressing start hides the sheet and deals a round, and the log says so',
      await p.$eval('#start', e => e.hidden) && (await handCards(p)).length >= 7 && /دورك$/.test(await turnText(p)), await turnText(p));
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

    /* ---- نقرةٌ ترفع وثانيةٌ تلعب، وشريحة اللون تسمّي ما على المرمى ---- */
    let moved = false;
    for (let k = 0; k < 30 && !moved; k++) {
      const live = await liveCards(p);
      if (live.length) {
        const name = await live[0].getAttribute('aria-label');
        await live[0].click(); await sleep(20);
        ok('the first tap raises the card and the hint says to tap again',
          !!(await p.$('#hand button.card.up')) && /مرّةً أخرى/.test(await hintText(p)), await hintText(p));
        await (await p.$('#hand button.card.up')).click(); await sleep(20);
        ok('the second tap plays it, and the colour chip names the card now on the pile',
          (await p.$eval('#clr', e => e.textContent)).indexOf(name) >= 0, await p.$eval('#clr', e => e.textContent));
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
      await sleep(1800);                                         // كلمةٌ تبقى ‏١٣٠٠‏ ثم تُطوى في ‏٣٠٠‏
      ok('and goes away by itself', !(await p.$eval('#toast', e => e.classList.contains('on'))));
    }

    /* ---- جولةٌ كاملة بالنقر وحده، و«واحدة» تُقال حين تبقى ورقتان ---- */
    let moves = 0, kinds = {};
    while (moves < 800) {
      if (await overText(p)) break;
      const what = await oneMove(p, true);
      if (!what) break;
      kinds[what] = (kinds[what] || 0) + 1;
      moves++;
    }
    const over = await overText(p);
    const m = over.match(/^فاز (.+?) بالجولة/);
    ok('a whole round is played through to a winner, by tapping only', !!m,
      moves + ' moves, panel: ' + over.replace(/\n/g, ' / '));
    ok('the round took real play, not one lucky card', moves > 6, 'moves=' + moves + ' ' + JSON.stringify(kinds));
    ok('«واحدة» was pressed on the way, with two cards in hand', kinds.one > 0, JSON.stringify(kinds));
    if (m) {
      const cap = await capText(p);
      const w = await p.$eval('#over .sc .w', e => e.textContent.trim());          // «فلان ٤٢»
      const pts = w.split(' ').slice(-1)[0];
      ok('the winner\'s line in the panel is the winner named above it', w.indexOf(m[1]) === 0, w);
      ok('the score on the bar matches the winner\'s points in the panel', cap.indexOf(String(num(pts))) >= 0, cap + ' vs ' + pts);
      ok('the hand is cleared when the round is over', (await handCards(p)).length === 0);
    }
    ok('the round offers a way on', (await texts(p, '#acts button')).indexOf('الجولة التالية') >= 0);
    await clickByText(p, '#acts button', 'الجولة التالية');
    await sleep(150);
    ok('the next round deals again and keeps the score',
      (await capText(p)).indexOf('round 2') >= 0 && ((await handCards(p)).length > 0 || await p.$eval('#handoff', e => !e.hidden)), await capText(p));

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
    if (called) {
      let pt = '';
      /* التنويه قد ينتظر خلف تنويهين قبله (نحو أربع ثوانٍ) */
      for (let k = 0; k < 80 && !/نسي «واحدة» ويسحب ٢/.test(pt); k++) { pt = await p.$eval('#toast', e => e.classList.contains('on') ? e.textContent.trim() : ''); if (!/نسي «واحدة»/.test(pt)) await sleep(80); }
      ok('and the call-out is punished with two cards, said on the screen', /نسي «واحدة» ويسحب ٢/.test(pt), pt);
    }

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
    await sleep(2600);                                           // كشف المسحوب (ثانية) ثم طيرانه ثم انزلاق الباقي، قبل القياس
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

    /* ============ ضدّ الحاسب: المقعد ٠ وحده الإنسان، والرؤية لا تتبدّل أبداً ============ */
    ({ ctx, p, errs } = await open(browser, 390, 844, '?seed=31'));
    await p.click('.modes .key[data-m="cpu"]');
    ok('picking «ضد الحاسب» arms it, and the three modes are all open',
      await p.$eval('.modes .key[data-m="cpu"]', e => e.classList.contains('on')) &&
      (await p.$$eval('.modes .key:disabled', es => es.length)) === 0);
    ok('the privacy switch is hidden — there is no hand-off in this mode',
      await p.$eval('#privacy', e => e.hidden));
    ok('the name list asks only the human for a name; the rest are computer seats',
      (await p.$$eval('#namelist input', es => es.length)) === 1 &&
      (await p.$$eval('#namelist .in:not(:has(input))', es => es.length)) === 2);
    await p.fill('#namelist input[data-i="0"]', 'حمد');
    await p.click('#startbtn'); await sleep(150);
    const cpuNames = await p.$$eval('#namelist .in:not(:has(input)) span:last-child', es => es.map(e => e.textContent.split(' — ')[0]));
    ok('two computer seats stand on the felt, named as promised', (await tags(p)).length === 2 && cpuNames.length === 2);

    let handoffSeen = false, minHand = 99, kindsCpu = {}, seenCpuToast = false, seenCpuSayOne = false, movesCpu = 0;
    for (let k = 0; k < 900 && movesCpu < 400; k++) {
      if (await overText(p)) break;
      if (await p.$eval('#handoff', e => !e.hidden)) { handoffSeen = true; break; }
      const n = (await handCards(p)).length;
      if (n < minHand) minHand = n;
      const tt = await p.$eval('#toast', e => e.classList.contains('on') ? e.textContent.trim() : '');
      if (tt && cpuNames.some(nm => tt.indexOf(nm) === 0)) {
        seenCpuToast = true;
        if (/«واحدة»/.test(tt)) seenCpuSayOne = true;
      }
      const t = await turnText(p);
      if (/، دوره$/.test(t)) { await sleep(120); continue; }
      const acts = await texts(p, '#acts button');
      const call = acts.find(x => /^نادِ على /.test(x));
      if (call) { await clickByText(p, '#acts button', call); movesCpu++; kindsCpu.callOut = (kindsCpu.callOut || 0) + 1; continue; }
      const what = await oneMove(p, true);
      if (!what) break;
      kindsCpu[what] = (kindsCpu[what] || 0) + 1;
      movesCpu++;
    }
    ok('the hand-off window never appears against the computer', !handoffSeen);
    ok('the human always has a hand to look at — never the computer\'s', minHand > 0, 'minHand=' + minHand);
    ok('the game actually moved (played, drew or passed) while the computer took its turns', movesCpu > 0, JSON.stringify(kindsCpu));
    ok('a computer\'s move popped up in its own name — no shared log', seenCpuToast, JSON.stringify(kindsCpu));
    ok('a computer said «واحدة» on its own', seenCpuSayOne);
    const overCpu = await overText(p);
    ok('a whole round against the computer reaches a winner', /^فاز /.test(overCpu) || /انتهت المباراة/.test(overCpu), overCpu.replace(/\n/g, ' / '));
    ok('nothing threw against the computer either', errs.length === 0, errs[0]);
    await ctx.close();

    /* ============ ‎سلوك الحاسب حتميّ ببذرة seed — لا Math.random ============ */
    /* لا تقيس هذا بعدّ تكرارٍ ثابت: مهلة الحاسب نفسها زمنٌ حقيقيّ (setTimeout)،
       فعدّ التكرارات يتسابق معها ويختلف من تشغيلٍ لآخر ولو كانت البذرة واحدة.
       القياس الصحيح نقطةٌ في اللعبة لا في الساعة: فعلٌ واحد من الإنسان، ثم
       الانتظار حتى يعود الدور إليه — وهذا يحدث دائماً بعد نفس تتابع الأفعال
       بالضبط لأن كل قرارٍ حاسوبيٍّ دالّةٌ صِرفةٌ في الحالة، بلا Math.random. */
    async function primeCpu(seed) {
      const r = await open(browser, 390, 844, '?seed=' + seed);
      await r.p.click('.modes .key[data-m="cpu"]');
      await r.p.click('#startbtn'); await sleep(150);
      if (!/، دوره$/.test(await turnText(r.p))) await oneMove(r.p, true);   // فعلٌ واحد من الإنسان، إن كان دوره
      for (let k = 0; k < 400; k++) {
        if (await overText(r.p)) break;
        if (!/، دوره$/.test(await turnText(r.p))) break;                   // عاد الدور إلى الإنسان — نقطةٌ حتميّة
        await sleep(100);
      }
      const state = await r.p.$eval('#cap-n', e => e.textContent.trim()) + '|' + (await r.p.$eval('#clr', e => e.textContent.trim()));
      await r.ctx.close();
      return state;
    }
    const rep1 = await primeCpu(47), rep2 = await primeCpu(47);
    ok('the same ?seed=N replays the same computer play', rep1 === rep2, rep1 + ' vs ' + rep2);


    /* =================================================================== *
     * الأونلاين (المرحلة ٤): غرفةٌ بمضيفٍ موثوق، بلا شبكةٍ حقيقية.
     *
     * ‎?net=loop‎ يستبدل WebRTC بـBroadcastChannel ولا يمسّ سطراً فوق طبقة
     * النقل: الغرفةُ والمقاعدُ والثقةُ واللقطاتُ ورؤيةُ كل مقعدٍ هي هي. وثمنُ
     * ذلك — أن القناة المحلّية يسمعها كل تبويبٍ على الأصل — هو بالضبط ما
     * يجعل هذا الفحص ممكناً: **يُنصت على السلك**، فيُثبَت أن ما أُرسل لمقعدٍ
     * لا يحمل إلا ما يحقّ له، لا أن يُقال ذلك ويُصدَّق.
     * =================================================================== */
    {
      const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
      const re = [];
      const H = await openIn(rctx, '?net=loop&seed=71', re);

      await H.fill('#namelist input', 'حمد');
      await H.click('.modes .key[data-m="online"]');
      await sleep(120);
      ok('online opens the room panel and puts the seat count away — the room decides it',
        await H.$eval('#net', e => !e.hidden) && await H.$eval('#countrow', e => e.hidden) &&
        await H.$eval('#privacy', e => e.hidden) &&
        (await H.$$eval('#namelist input', es => es.length)) === 1);

      await H.click('#mkroom');
      await sleep(600);
      const code = (await H.textContent('#roomcode')).trim();
      ok('a room code is five letters, and none of them can be misheard',
        /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(code) && !/[0O1IL]/.test(code), code);
      ok('the code is offered as a link as well as a word',
        (await H.textContent('#roomlink')).indexOf('?join=' + code) > 0, await H.textContent('#roomlink'));
      const codes = await H.evaluate(() => { const a = []; for (let i = 0; i < 400; i++) a.push(ShaddaNet.makeCode()); return a.join(''); });
      ok('and no code this page can make carries 0, O, 1, I or L', !/[0O1IL]/.test(codes));

      /* السلك: تبويبٌ ثالثٌ يفتح القناة نفسها ويسجّل كل ما يمرّ */
      const TAP = await openIn(rctx, '?net=loop', re);
      await TAP.evaluate(c => {
        window.__tap = [];
        window.__ch = new BroadcastChannel('shadda-room-' + c);
        window.__ch.onmessage = e => { window.__tap.push(e.data); };
        window.__forge = env => window.__ch.postMessage(env);
      }, code);

      const G1 = await openIn(rctx, '?net=loop&join=' + code, re);
      ok('a ?join= link arrives already in online mode with the code filled in',
        (await G1.inputValue('#codein')) === code && await G1.$eval('#net', e => !e.hidden) &&
        await G1.$eval('.modes .key[data-m="online"]', e => e.classList.contains('on')));
      await G1.fill('#namelist input', 'سارة');
      await G1.click('#joingo');
      await sleep(900);

      const G2 = await openIn(rctx, '?net=loop&join=' + code, re);
      await G2.fill('#namelist input', 'خالد');
      await G2.click('#joingo');
      await sleep(900);

      const ros = await rosterText(H);
      ok('the host sees the room fill: three names, all present',
        ros.indexOf('حمد') >= 0 && ros.indexOf('سارة') >= 0 && ros.indexOf('خالد') >= 0 && !/انقطع/.test(ros), ros);
      ok('a guest is told its own seat and waits for the host',
        /ينتظر المضيف/.test(await H.textContent('#startbtn')) === false &&
        (await G1.textContent('#startbtn')).trim() === 'ينتظر المضيف' &&
        await G1.$eval('#startbtn', e => e.disabled), await G1.textContent('#startbtn'));

      await H.click('#startbtn');
      await sleep(1200);
      const seats = [H, G1, G2];
      const hands = [];
      for (const p of seats) hands.push((await handCards(p)).length);
      ok('the deal reaches every seat: the sheet drops and each holds its own seven',
        (await Promise.all(seats.map(p => p.$eval('#start', e => e.hidden)))).every(Boolean) &&
        hands.every(k => k === 7 || k === 9), hands.join('/'));
      ok('and each screen shows the other two as backs on the felt',
        (await Promise.all(seats.map(p => tags(p)))).every(t => t.length === 2));

      /* ---- ما يمرّ على السلك: رؤيةُ المقعد وحدها، لا الحالة ---- */
      const wire = await TAP.evaluate(() => window.__tap.map(e => { try { return { to: e.to, m: JSON.parse(e.m) }; } catch (x) { return null; } }).filter(Boolean));
      const views = wire.filter(x => x.m && x.m.t === 'v').map(x => x.m);
      ok('the host pushed a view to every remote seat', views.length >= 2, String(views.length));
      ok('and not one of them carried anything that seat may not know',
        views.length > 0 && views.every(m => {
          const v = m.v;
          if (!v || typeof v !== 'object') return false;
          if ('hands' in v || 'stock' in v || 'seed' in v || 'rng' in v || 'wild4' in v) return false;
          if (v.challenge && 'legal' in v.challenge) return false;
          if (typeof v.you !== 'number' || v.you < 1) return false;
          return typeof v.stockCount === 'number' && Array.isArray(v.counts) &&
                 Array.isArray(v.hand) && v.hand.length === v.counts[v.you];
        }), JSON.stringify(views[0] && Object.keys(views[0].v || {})));
      ok('no message on the wire ever carried the whole state',
        !wire.some(x => x.m && x.m.v && ('hands' in x.m.v || 'stock' in x.m.v)));

      /* ---- ورقةٌ تُلعب من جهازٍ بعيد: لا سحباً وحده ----
         السحب يمرّ من المفاتيح، واللعب يمرّ من اليد — وهما مساران مختلفان.
         فحصٌ يقنع بالسحب يمرّ على يدٍ ميّتةٍ تماماً عند الضيف. */
      let guestPlayed = false;
      for (let k = 0; k < 150 && !guestPlayed; k++) {
        const step = await roomMove(seats, true);
        if (!step || !step.what || step.what === 'stuck') break;
        if (step.what === 'play' && step.p !== H) guestPlayed = true;
        await sleep(160);
      }
      ok('a card played on a remote device is ruled on by the host and reaches the table', guestPlayed);

      /* ---- لقطةُ الحالة الدورية: المضيف يعيد تأكيد الحقيقة بلا حدثٍ جديد ---- */
      await TAP.evaluate(() => { window.__tap.length = 0; });
      await sleep(3600);
      const snaps = await TAP.evaluate(() => window.__tap.map(e => { try { return JSON.parse(e.m); } catch (x) { return null; } }).filter(m => m && m.t === 'v'));
      const bySeat = {};
      for (const m of snaps) { const s = m.v && m.v.you; bySeat[s] = bySeat[s] || []; bySeat[s].push(m.n); }
      ok('a state snapshot keeps going out while nothing happens, and repeats its number so no notice is said twice',
        Object.keys(bySeat).length >= 2 && Object.keys(bySeat).every(s => bySeat[s].length >= 2 && new Set(bySeat[s]).size === 1),
        JSON.stringify(bySeat));

      /* ---- لا يُصدَّق الضيف في من هو ---- */
      const peers = await TAP.evaluate(() => {
        /* معرّفات المتكلّمين تُقرأ من الأظرف على السلك، لا من رسالةٍ تدّعيها */
        const s = new Set();
        for (const e of window.__tap) if (e && typeof e.from === 'string') s.add(e.from);
        return [...s];
      });
      const guestPeers = peers.filter(x => x !== 'H');
      ok('the wire shows the room has exactly two remote peers', guestPeers.length === 2, peers.join(','));

      const before = await tagCounts(H);
      const myBefore = (await handCards(H)).length;
      await TAP.evaluate(({ c, from }) => {
        const bad = [
          null, 42, 'not json at all', [], {},
          { t: 'zzz' }, { t: 'a' }, { t: 'a', a: null }, { t: 'a', a: 42 },
          { t: 'a', a: { type: 'nosuch' } },
          { t: 'a', a: { type: 'play', card: '__proto__' } },
          { t: 'a', a: { type: 'draw' }, seat: 0, player: 99 },
          { t: 'v', v: { hands: [[1]] } },
        ];
        for (const b of bad) window.__forge({ room: c, from: from, to: 'H', m: typeof b === 'string' ? b : JSON.stringify(b) });
        window.__forge({ room: c, from: from, to: 'H' });
        window.__forge({ room: c, from: from, to: 'H', m: '{' });
      }, { c: code, from: guestPeers[0] });
      await sleep(900);
      ok('a forged seat, a forged player, a bent action and plain rubbish all leave the table exactly as it was',
        (await tagCounts(H)).join(',') === before.join(',') && (await handCards(H)).length === myBefore,
        before.join(',') + ' -> ' + (await tagCounts(H)).join(','));
      ok('and nothing on any page threw while that arrived', re.length === 0, re[0]);

      /* والمقعد يُقرأ من جدول المضيف: فعلٌ مزوّرٌ عليه ‎seat:0‎ يُطبَّق على
         مقعد مُرسِله هو، ولا يمسّ المقعد ٠ بحال. */
      let turnHolder = null, idle = 0;
      for (let k = 0; k < 150 && !turnHolder; k++) {
        if (ACTS_HERE.test(await turnText(G1))) { turnHolder = true; break; }
        const step = await roomMove(seats, true);
        if (!step || !step.what) { if (++idle > 8) break; await sleep(300); continue; }
        idle = 0;
        await sleep(200);
      }
      if (turnHolder) {
        const h0 = (await handCards(H)).length, g1 = (await handCards(G1)).length;
        /* من يحمل الدور الآن سارة (المقعد ١)؛ يُزوَّر فعلُها وعليه ‎seat:0‎ */
        await TAP.evaluate(({ c, from }) => {
          window.__forge({ room: c, from: from, to: 'H', m: JSON.stringify({ t: 'a', a: { type: 'draw' }, seat: 0, player: 0 }) });
        }, { c: code, from: guestPeers[0] });
        await sleep(900);
        const h1 = (await handCards(H)).length, g1b = (await handCards(G1)).length;
        ok('an action that claims seat 0 lands on the seat the host gave its sender, never on seat 0',
          h1 === h0 && g1b >= g1, 'host ' + h0 + '->' + h1 + ', guest ' + g1 + '->' + g1b);
      } else {
        ok('an action that claims seat 0 lands on the seat the host gave its sender, never on seat 0', false, 'the turn never reached the guest');
      }

      /* ---- الأحداث الخاصّة: دالّةٌ خالصة تُفحص وحدها ---- */
      const filt = await H.evaluate(() => {
        const ev = [
          { t: 'drew', seat: 1, n: 2, cards: [5, 6] },
          { t: 'challenged', by: 2, from: 1, bluff: true, hand: [1, 2, 3], drew: 4 },
          { t: 'played', seat: 1, card: 9 }
        ];
        return { one: ShaddaNet.eventsFor(ev, 1), two: ShaddaNet.eventsFor(ev, 2), three: ShaddaNet.eventsFor(ev, 3) };
      });
      ok('a draw keeps its cards for the seat that drew, and loses them for everyone else',
        filt.one[0].cards.length === 2 && filt.two[0].cards === undefined && filt.three[0].cards === undefined &&
        filt.two[0].n === 2 && filt.three[0].n === 2, JSON.stringify(filt.two[0]));
      ok('a challenge shows the revealed hand to the two seats in it and to nobody else',
        filt.one[1].hand.length === 3 && filt.two[1].hand.length === 3 && filt.three[1].hand === undefined &&
        filt.three[1].bluff === true, JSON.stringify(filt.three[1]));

      /* ---- سطر القياس خلف مفتاح ---- */
      await H.click('#menu'); await sleep(150);
      await H.click('#statsw'); await sleep(1300);
      const meas = await H.$eval('#meas', e => e.hidden ? '' : e.textContent.trim());
      ok('the measure line reads live numbers when its switch is on',
        /^net loop /.test(meas) && /rtt /.test(meas) && /in .*\/s out .*\/s/.test(meas) && /peers 2/.test(meas), meas);
      await H.click('#resume'); await sleep(200);

      /* ---- مقعدٌ يخرج: يُفلت في حينه، والغرفة لا تقف عليه ---- */
      await G2.close();
      await sleep(3200);
      const ros2 = await rosterText(H);
      ok('a seat that leaves is let go at once and shown as gone, its place kept for it', /انقطع/.test(ros2), ros2);

      let stood = false;
      for (let k = 0; k < 60; k++) {
        const t = await turnText(H);
        if (/^خالد، دوره$/.test(t)) {
          const keys = await texts(H, '#acts button');
          if (keys.some(x => /^امضِ عن /.test(x))) {
            await clickByText(H, '#acts button', /^امضِ عن /);
            stood = true;
            await sleep(500);
            break;
          }
        }
        const step = await roomMove([H, G1], true);
        if (!step || !step.what) { await sleep(200); continue; }
        await sleep(220);
      }
      ok('and when the turn reaches that empty seat the host can walk it on, so the room never locks', stood);

      /* ---- من عاد رُدّ إلى مقعده هو ---- */
      await G1.reload({ waitUntil: 'load' });
      await sleep(600);
      await G1.click('#joingo');
      await sleep(1200);
      const back = await G1.evaluate(() => document.getElementById('start').hidden);
      const backTags = await tags(G1);
      ok('a guest that comes back with the same tab is put back in its own seat',
        back && backTags.length === 2, 'sheet hidden=' + back + ' tags=' + backTags.length);

      ok('the whole room was played without one request leaving the machine', re.length === 0, re[0]);
      await rctx.close();
    }


    /* ---- سلكٌ يسقط في منتصف اليد ----
       المالك قطع شبكة جوّاله وهو يلعب فوجد نفسه على شاشة البداية، ومقعده
       وورقه محجوزان عند المضيف. الفرق بين «ودّعك المضيف» و«سقط السلك» هو
       الفرق بين انتهاء الغرفة وبين ثانيةٍ عابرة، ولم يكن يُفرَّق بينهما.
       ويُقاد هنا بإسقاط صفحة المضيف إسقاطاً يُسكتها بلا وداع — إغلاقُها
       إغلاقاً نظيفاً يرسل ‎bye‎، وتعطيلُ مؤقّتاتها لا يُسكتها لأنها تجيب
       الرسائل بالحدث لا بالمؤقّت (جُرّب، فلم يسقط السلك). */
    {
      const dctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
      const de = [];
      const DH = await openIn(dctx, '?net=loop&seed=61', de);
      await DH.fill('#namelist input', 'حمد');
      await DH.click('.modes .key[data-m="online"]');
      await DH.click('#mkroom');
      await sleep(600);
      const dcode = (await DH.textContent('#roomcode')).trim();
      const DG = await openIn(dctx, '?net=loop&join=' + dcode, de);
      await DG.fill('#namelist input', 'سارة');
      await DG.click('#joingo');
      await sleep(900);
      await DH.click('#startbtn');
      await sleep(1200);
      const dealt = (await handCards(DG)).length;

      await DH.goto('chrome://crash').catch(() => {});
      let down = false;
      for (let k = 0; k < 14 && !down; k++) {
        await sleep(1000);
        down = await DG.evaluate(() => !document.getElementById('netdown').hidden);
        if (!(await DG.evaluate(() => document.getElementById('start').hidden))) break;
      }
      ok('a wire that drops mid-hand does not throw the player off the table',
        down && await DG.evaluate(() => document.getElementById('start').hidden) && (await handCards(DG)).length === dealt,
        'down=' + down + ' sheet hidden=' + await DG.evaluate(() => document.getElementById('start').hidden) +
        ' hand ' + dealt + '->' + (await handCards(DG)).length);
      ok('and it says so, names the room, and keeps trying to get back in',
        /نحاول العودة إلى الغرفة/.test(await DG.textContent('#netdowntxt')) &&
        (await DG.textContent('#netdowntxt')).indexOf(dcode) > 0, (await DG.textContent('#netdowntxt')).trim());
      ok('nothing threw while the wire was down', de.length === 0, de[0]);
      await dctx.close();
    }

    /* ---- ومضيفٌ يُغلق غرفته فعلاً: ذاك انتهاءٌ لا انقطاع ---- */
    {
      const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
      const be = [];
      const BH = await openIn(bctx, '?net=loop&seed=62', be);
      await BH.fill('#namelist input', 'حمد');
      await BH.click('.modes .key[data-m="online"]');
      await BH.click('#mkroom');
      await sleep(600);
      const bcode = (await BH.textContent('#roomcode')).trim();
      const BG = await openIn(bctx, '?net=loop&join=' + bcode, be);
      await BG.fill('#namelist input', 'سارة');
      await BG.click('#joingo');
      await sleep(900);
      await BH.click('#startbtn');
      await sleep(1200);
      await BH.close();
      await sleep(2500);
      const note = (await BG.textContent('#netnote')).trim();
      ok('a host that closes its room sends the guest back with the reason said',
        !(await BG.evaluate(() => document.getElementById('start').hidden)) && /خرج المضيف/.test(note), note);
      ok('and does not promise a seat in a room that is gone', !/مقعدك محفوظ/.test(note), note);
      ok('and the way back in is one press, with the code already in it',
        (await BG.evaluate(() => { const b = document.getElementById('rejoin'); return b.hidden ? '' : b.textContent; })).indexOf(bcode) > 0,
        await BG.evaluate(() => { const b = document.getElementById('rejoin'); return b.hidden ? '(hidden)' : b.textContent; }));
      ok('nothing threw when the room closed', be.length === 0, be[0]);
      await bctx.close();
    }

    /* ---- غرفةٌ ممتلئة: خمسةٌ حدُّ الطاولة، والسادس يُخبَر صراحةً ---- */
    {
      const fctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
      const fe = [];
      const F = await openIn(fctx, '?net=loop&seed=77', fe);
      await F.fill('#namelist input', 'المضيف');
      await F.click('.modes .key[data-m="online"]');
      await F.click('#mkroom');
      await sleep(600);
      const fcode = (await F.textContent('#roomcode')).trim();
      const gs = [];
      for (let i = 0; i < 5; i++) {
        const g = await openIn(fctx, '?net=loop&join=' + fcode, fe);
        await g.fill('#namelist input', 'ضيف' + (i + 1));
        await g.click('#joingo');
        await sleep(650);
        gs.push(g);
      }
      ok('the host seats four guests and no more', (await F.$$eval('#roster .r', es => es.length)) === 5,
        String(await F.$$eval('#roster .r', es => es.length)));
      ok('the fifth guest is told the room is full rather than left waiting',
        /ممتلئة/.test((await gs[4].textContent('#netnote')).trim()), (await gs[4].textContent('#netnote')).trim());
      ok('nothing threw while the room filled', fe.length === 0, fe[0]);
      await fctx.close();
    }


    /* ---- WebRTC حقيقي: ندّان في سياقين منفصلين، وقناةٌ تُفتح فعلاً ----
       مطفأٌ ما لم يُطلب بـ‎--rtc‎: يحتاج إنترنت، وبقيّة هذا الملفّ تشترط
       ألّا يخرج طلبٌ واحد. وهو يثبت ما لا يثبته ‎loop‎: أن التوقيع يمرّ على
       الوسيط العام بالشكل الذي قِيس، وأن قناة البيانات تُفتح وتحمل اللعب. */
    if (RTC) {
      const mk = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
      const hc = await mk(), gc = await mk();
      const he = [], ge = [];
      const H = await openIn(hc, '?seed=91', he);
      const G = await openIn(gc, '', ge);

      await H.fill('#namelist input', 'حمد');
      await H.click('.modes .key[data-m="online"]');
      await H.click('#mkroom');
      let code = '';
      for (let k = 0; k < 40 && !code; k++) { await sleep(500); code = (await H.textContent('#roomcode')).trim(); }
      ok('rtc: the broker gave the host its room', /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(code),
        code + ' / ' + (await H.textContent('#netnote')).trim());

      await G.fill('#namelist input', 'سارة');
      await G.click('.modes .key[data-m="online"]');
      await G.click('#joinroom');
      await G.fill('#codein', code);
      await G.click('#joingo');
      let seated = false;
      for (let k = 0; k < 60 && !seated; k++) {
        await sleep(500);
        seated = (await H.$$eval('#roster .r', es => es.length)) === 2;
      }
      ok('rtc: a data channel opened across the broker and the guest took a seat', seated,
        (await G.textContent('#netnote')).trim());

      if (seated) {
        await H.click('#startbtn');
        await sleep(2500);
        const hands = [(await handCards(H)).length, (await handCards(G)).length];
        ok('rtc: the deal crossed the wire and each seat holds its own seven',
          hands.every(k => k === 7 || k === 9), hands.join('/'));
        let moved = false;
        for (let k = 0; k < 60 && !moved; k++) {
          const step = await roomMove([H, G], true);
          if (!step) { await sleep(300); continue; }
          if (step.what === 'play' || step.what === 'one') moved = true;
          await sleep(300);
        }
        ok('rtc: a card played on one device is ruled on by the other', moved);
        await H.click('#menu'); await H.click('#statsw'); await sleep(1600);
        const meas = await H.$eval('#meas', e => e.hidden ? '' : e.textContent.trim());
        ok('rtc: the measure line reads a real link', /^net rtc /.test(meas) && /ice /.test(meas), meas);
        console.log('     ' + meas);
      }
      /* الطلبات الخارجية هنا متوقّعة، لكنها محدودةٌ بمن أُعلن — تُقرأ وتُفحص */
      const all = he.concat(ge);
      const hosts = [...new Set(all.filter(x => /^external: /.test(x))
        .map(u => { try { return new URL(u.slice(10)).hostname; } catch (e) { return u; } }))];
      const threw = all.filter(x => !/^external: /.test(x));
      ok('rtc: nothing was reached but the declared broker', hosts.length > 0 && hosts.every(x => x === '0.peerjs.com'), hosts.join(' '));
      ok('rtc: nothing threw', threw.length === 0, threw[0]);
      await hc.close(); await gc.close();
    }

    /* ============ ضدّ الحاسب من اثنين حتى خمسة ============ */
    for (const n of [2, 5]) {
      const r = await open(browser, 390, 844, '?seed=' + (50 + n));
      await r.p.click('.modes .key[data-m="cpu"]');
      await r.p.click('#count [data-n="' + n + '"]'); await sleep(30);
      ok(n + ' vs computer: the name list asks the human alone',
        (await r.p.$$eval('#namelist input', es => es.length)) === 1);
      await r.p.click('#startbtn'); await sleep(150);
      ok(n + ' vs computer: that many computer seats stand on the felt', (await tags(r.p)).length === n - 1);
      let played = false, hoff = false;
      for (let k = 0; k < 200 && !played; k++) {
        if (await r.p.$eval('#handoff', e => !e.hidden)) { hoff = true; break; }
        const t = await turnText(r.p);
        if (/، دوره$/.test(t)) { await sleep(120); continue; }
        const what = await oneMove(r.p, true);
        if (!what) break;
        if (what === 'play') played = true;
      }
      ok(n + ' vs computer: a card can actually be played and no hand-off appears', played && !hoff);
      ok(n + ' vs computer: nothing threw', r.errs.length === 0, r.errs[0]);
      await r.ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(bad ? '\n' + bad + ' FAILED' : '\nALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
