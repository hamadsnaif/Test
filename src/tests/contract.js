/* العقد الذي تلتزم به كل صفحة لعبة في المجموعة.
 *
 *   node src/tests/contract.js bounce.html snake.html tetris.html cadet.html frozen.html
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
const PAGES = args.length ? args : ['bounce.html', 'snake.html', 'tetris.html', 'cadet.html', 'frozen.html'];

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
            const btns = [...document.querySelectorAll('button')].filter(vis);
            const keys = btns
              .map(e => ({ id: e.id || e.className.split(' ')[0], min: Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)) }));
            /* العقد يقول: «لكل مفتاح رقعة لمس تمتدّ خارجه إلى الفراغ لا نحو
               جاره». وهذا يُفحص هنا بالأثر: تُمسح رقعةُ كل مفتاح من الداخل
               ويُسأل المتصفّح مَن يلتقط كل نقطة. فإن كان المالك مفتاحاً آخر
               فقد زحف جارٌ على جاره — وذلك عطبٌ يُميت مفتاحاً كاملاً بلا أن
               يبين في الصورة: وقع فعلاً في زوج تصويب الفقاعات، إذ كانت رقعتا
               اللمس تُقاسان من حاضنهما لا من مفتاحيهما فغطّت كلٌّ الزرّين
               وابتلعت الأخيرةُ الأولى. وما لا يملكه مفتاحٌ أصلاً لا يُحسب
               (لسبيس كاديت طبقةٌ شفّافة تعلو رقعها بقصد). */
            const own = (x, y) => {
              const e = document.elementFromPoint(x, y);
              if (!e) return null;
              const b = e.closest('button');
              return b && btns.includes(b) ? b : null;
            };
            /* مفتاحٌ مقصوصٌ بحاضنٍ ذي `overflow` ليس مفتاحاً على الشاشة: صندوقه
               قد يقع خلف الجهاز وهو غير قابلٍ للمس هناك، فمساءلةُ ذلك الصندوق
               تبلاغٌ كاذب. فيُحسب تقاطع صناديق الحواضن القاصّة، وما خرج مركزه
               عنه يُترك — وهذا لا يُرخي الفحص: العطبان اللذان وجدهما كان
               مفتاحاهما ظاهرين تماماً ومركزُ كلٍّ داخل كل حاضن. */
            const clipRect = el => {
              let r = { l: -1e9, t: -1e9, rt: 1e9, b: 1e9 };
              for (let a = el.parentElement; a; a = a.parentElement) {
                const st = getComputedStyle(a);
                if (st.overflow === 'visible' && st.overflowX === 'visible' && st.overflowY === 'visible') continue;
                const q = a.getBoundingClientRect();
                r = { l: Math.max(r.l, q.left), t: Math.max(r.t, q.top),
                      rt: Math.min(r.rt, q.right), b: Math.min(r.b, q.bottom) };
              }
              return r;
            };
            const onScreen = b => {
              const q = b.getBoundingClientRect(), c = clipRect(b);
              const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
              return cx >= c.l && cx <= c.rt && cy >= c.t && cy <= c.b;
            };
            const name = e => e.id || e.className.split(' ')[0];
            /* مروحة ورقٍ تتراكب بقصد: كل ورقةٍ تغطّي جارتها ولا يبقى منها إلا
               طرفها. فسؤالُ «هل زحف جارٌ على جار» لا معنى له هناك — لكن
               التهاونَ فيه يفتح باباً لورقةٍ مدفونةٍ تماماً لا تُلمس. فمنطقةٌ
               واحدة تُعلن ‎[data-fan]‎ يسقط عنها فحص التراكب ويقوم مقامه فحصٌ
               أشدّ: أكبر رقعةٍ **تملكها الورقة وحدها** يجب أن تبلغ ‎44px‎ في
               البعدين. فالورقة المدفونة تسقط، والمكشوف طرفُها وحده يمرّ إن كان
               طرفها يكفي إبهاماً. وتُقاس الرقعة بمسحٍ كل ‎2px‎ ثم أكبرِ مستطيلٍ
               في المدرّج، لا بصندوق الورقة — فالصندوق يكذب هنا. */
            const ownedPatch = (b, step) => {
              const r = b.getBoundingClientRect();
              const cols = Math.floor((r.width - step) / step) + 1;
              const rows = Math.floor((r.height - step) / step) + 1;
              if (cols < 1 || rows < 1) return { w: 0, h: 0, min: 0 };
              const x0 = r.left + step / 2, y0 = r.top + step / 2;
              const hist = new Array(cols).fill(0);
              let best = { w: 0, h: 0, min: 0 };
              for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++)
                  hist[i] = own(x0 + i * step, y0 + j * step) === b ? hist[i] + 1 : 0;
                const st = [];
                for (let i = 0; i <= cols; i++) {
                  const h = i === cols ? 0 : hist[i];
                  while (st.length && hist[st[st.length - 1]] >= h) {
                    const hh = hist[st.pop()];
                    const l = st.length ? st[st.length - 1] + 1 : 0;
                    const w = (i - l) * step, ht = hh * step;
                    if (Math.min(w, ht) > best.min) best = { w, h: ht, min: Math.min(w, ht) };
                  }
                  st.push(i);
                }
              }
              return best;
            };
            const steal = [], buried = [];
            for (const b of btns) {
              const r = b.getBoundingClientRect();
              if (r.width < 8 || r.height < 8) continue;
              if (!onScreen(b)) continue;                 // مقصوصٌ: ليس هدفاً هنا
              if (b.closest('[data-fan]')) {
                const q = ownedPatch(b, 2);
                if (q.min < 44) buried.push({ id: name(b), w: Math.round(q.w), h: Math.round(q.h) });
                continue;
              }
              const thieves = {};
              for (let y = r.top + 3; y <= r.bottom - 3; y += 4) {
                for (let x = r.left + 3; x <= r.right - 3; x += 4) {
                  const o = own(x, y);
                  if (o && o !== b) thieves[name(o)] = (thieves[name(o)] || 0) + 1;
                }
              }
              const c = own(r.left + r.width / 2, r.top + r.height / 2);
              const centreWrong = c && c !== b ? name(c) : null;
              const t = Object.keys(thieves);
              if (t.length || centreWrong)
                steal.push({ id: name(b), centre: centreWrong,
                             by: t.map(k => k + '\u00d7' + thieves[k]).join(' ') });
            }
            const canvases = [...document.querySelectorAll('canvas')].filter(vis)
              .map(c => c.id + ':' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height));
            const rows = ['.cap', '.deck', '.pads', '.field', '.top'].map(s => document.querySelector(s))
              .filter(Boolean).map(e => getComputedStyle(e).direction);
            const openSheet = [...document.querySelectorAll('.sheet')].filter(e => !e.hidden && vis(e));
            return {
              fullscreen: document.body.dataset.layout === 'fullscreen',
              needsAssets: document.body.dataset.needsAssets !== undefined,
              intake: openSheet.reduce((n, sh) => n + [...sh.querySelectorAll('button')].filter(vis).length, 0),
              renderDom: document.body.dataset.render === 'dom',
              tables: [...document.querySelectorAll('[data-table]')].filter(vis)
                .map(e => e.getBoundingClientRect())
                .filter(q => q.width >= innerWidth / 10 && q.height >= innerHeight / 10).length,
              ovX: document.documentElement.scrollWidth > innerWidth + 1,
              ovY: document.documentElement.scrollHeight > innerHeight + 1,
              small: keys.filter(k => k.min < 44),
              steal, buried,
              canvases, rows,
              layers: getComputedStyle(document.body).backgroundImage.split('gradient').length - 1,
              bgMatch: document.body.dataset.bg === 'match',
              bgColor: getComputedStyle(document.body).backgroundColor,
            };
          });
          const rm = await ctx.newPage();
          await rm.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: 'load' });
          const label = (name + (framed ? '_f' : '')).padEnd(12);
          const fails = [];
          if (m.ovX) fails.push('overflows sideways');
          if (m.ovY) fails.push('overflows down');
          if (m.small.length) fails.push('under 44: ' + m.small.map(k => k.id + ':' + k.min).join(' '));
          if (m.buried.length) fails.push('a fanned card is buried: ' + m.buried
            .map(c => c.id + ' owns only ' + c.w + 'x' + c.h).join(' | '));
          if (m.steal.length) fails.push('a key overlaps its neighbour: ' + m.steal
            .map(s => s.id + (s.centre ? ' centre taken by ' + s.centre : '') + (s.by ? ' (' + s.by + ')' : ''))
            .join(' | '));
          if (errs.length) fails.push('page error: ' + errs[0]);
          if (ext.length) fails.push('external request: ' + ext[0]);
          /* لعبة تُشغّل محرّكاً يحتاج ملفّات اللاعب لا لوح لها ترسمه قبل أن
             يجلبها — سبيس كاديت تبتدئ بشاشة استقبال، ولا تُقلع إلا بملفّات
             نسخته هو. تُعفى من شرط اللوح المرئي وحده، وبشرطين يشدّان الفحص لا
             يُرخيانه: أن تُعلن ذلك عن نفسها بـ‎body[data-needs-assets]‎، وأن
             تعرض مكانه واجهةً فيها زرّ ظاهر يستدعي الملفّات. فلا تمرّ صفحة
             فارغة بحجّة أنها تنتظر شيئاً، ولا تمرّ لعبةٌ عاديةٌ فقدت لوحها. */
          /* وطاولةُ ورقٍ من DOM وCSS 3D لا لوح لها أصلاً، ولا يصحّ أن تُصنع
             لها طبقةٌ نقطيةٌ لا تلعب دوراً لتمرّ. تُعفى من شرط اللوح وحده،
             وبشرطين يشدّان الفحص: أن تُعلن ذلك بـ‎body[data-render=dom]‎، وأن
             يكون فيها عنصرُ لعبٍ مُعلَنٌ ‎[data-table]‎ مرئيٌّ بمقاسٍ حقيقي —
             عُشرُ الشاشة فأكثر في البعدين. فلا تمرّ صفحةٌ فارغة بالإعلان، ولا
             لعبةٌ عاديةٌ فقدت لوحها. */
          if (!m.canvases.length) {
            if (m.needsAssets) { if (!m.intake) fails.push('needs assets yet offers no way to supply them'); }
            else if (m.renderDom) { if (!m.tables) fails.push('declares a DOM board yet shows no [data-table] of real size'); }
            else fails.push('no visible canvas');
          }
          /* صفوف الجهاز المادية يجب أن تكون ltr وإلا انقلبت الأسهم مع اتجاه
             الصفحة العربي. لكن ليست كل لعبة جهازاً: طاولة البينبول تملأ الشاشة
             بلا هيكل ولا لوحة مفاتيح — المضربان نصفا الشاشة نفسها — فلا صفّ
             فيها ليُفحص. تُعفى من هذا التحقّق وحده، وبشرطين: أن تُعلن ذلك عن
             نفسها بـ‎body[data-layout=fullscreen]‎، وألّا يبقى فيها صفّ هيكل
             يناقض الإعلان. ومن لم تُعلن فعليها أن تحمل صفّاً واحداً على الأقل —
             وهذا تشديد: قبله كانت لعبة فقدت صفوفها كلها تمرّ بصمت. */
          if (m.fullscreen) {
            if (m.rows.length) fails.push('declares fullscreen yet has chassis rows');
          } else if (!m.rows.length) fails.push('no chassis row found');
          else if (m.rows.some(d => d !== 'ltr')) fails.push('a physical row is not ltr');
          /* خلفية مسطّحة عيبٌ عادةً — إلا في صفحة تملأها لعبةٌ لها سوادها هي،
             فأي تدرّج خلفها يُظهر حدّاً بينها وبين ما حولها. فتُعفى بشرطين لا
             بواحد: أن تُعلن ذلك بـ‎body[data-bg=match]‎، وأن يكون المسطّح
             سواداً فعلاً — فلا يصير الإعفاء باباً لأي لون مسطّح. */
          if (m.layers < 2) {
            const rgb = (m.bgColor.match(/\d+/g) || []).slice(0, 3).map(Number);
            const black = rgb.length === 3 && rgb.every(v => v <= 16);
            if (!m.bgMatch) fails.push('the page background is a flat colour');
            else if (!black) fails.push('claims to match the game yet is not its black: ' + m.bgColor);
          }
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
