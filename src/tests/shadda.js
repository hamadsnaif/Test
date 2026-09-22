/* محرّك شدّة — فحوصٌ حتمية بالبذرة، بلا متصفّح.
 *
 *   node src/tests/shadda.js
 *
 * المحرّك يعيش داخل src/games/shadda.html بين علامتين، فيُقتطع منه ويُشغَّل في
 * سياقٍ خالٍ بـvm: لا document ولا window ولا نافذةَ متصفّحٍ أصلاً. فإن أشار
 * المحرّك إلى شيءٍ من ذلك سقط هنا بصوتٍ عالٍ — وهذا أوّل ما يُفحص.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..', '..');
const PAGE = path.join(REPO, 'src', 'games', 'shadda.html');
const A = '/* ===== SHADDA ENGINE START ===== */';
const B = '/* ===== SHADDA ENGINE END ===== */';

const html = fs.readFileSync(PAGE, 'utf8');
const i = html.indexOf(A), j = html.indexOf(B);
if (i < 0 || j < 0) { console.error('FAIL the engine markers are not in the page'); process.exit(1); }
const SRC = html.slice(i, j + B.length);

let bad = 0, ran = 0;
function ok(name, cond, extra) {
  ran++;
  if (cond) console.log('PASS ' + name);
  else { bad++; console.log('FAIL ' + name + (extra === undefined ? '' : '  — ' + extra)); }
}
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }

/* ---------- ١- نقاء المحرّك: لا أثر للرسم فيه ------------------------ */
const FORBIDDEN = ['document', 'window', 'localStorage', 'sessionStorage',
  'Math.random', 'setTimeout', 'setInterval', 'requestAnimationFrame',
  'getComputedStyle', 'fetch', 'navigator', 'addEventListener'];
/* الشروح تُنزع قبل المسح: المحرّك يذكر في شرحه ما لا يستدعيه، والفحص عن
   الاستدعاء لا عن الذكر. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const dirty = FORBIDDEN.filter(w => CODE.indexOf(w) >= 0);
ok('the engine names nothing from the page', dirty.length === 0, dirty.join(' '));

const ctx = { module: { exports: {} } };
vm.createContext(ctx);
vm.runInContext(SRC, ctx, { filename: 'shadda-engine.js' });
const S = ctx.Shadda;
ok('the engine runs in a context with no browser at all', !!S && typeof S.createGame === 'function');
if (!S) { console.log('\n1 FAILED'); process.exit(1); }

/* ---------- أدوات الفحص ---------------------------------------------- */
const seen = st => st.hands.reduce((a, h) => a.concat(h), []).concat(st.stock, st.discard);
function conserved(st) {
  const all = seen(st);
  return all.length === 108 && new Set(all).size === 108;
}
/* حالةٌ مصنوعةٌ باليد: الحالة JSON صِرف، فتعديلها مشروعٌ في فحص. */
function rig(seats, hands, topId, colour, extra) {
  const g = S.createGame({ seats: seats, seed: 7 }).state;
  const used = new Set();
  hands.forEach(h => h.forEach(c => used.add(c)));
  used.add(topId);
  g.hands = hands.map(h => h.slice());
  g.discard = [topId];
  g.colour = colour;
  g.stock = [];
  for (let k = 0; k < 108; k++) if (!used.has(k)) g.stock.push(k);
  g.turn = 0; g.dir = 1; g.phase = 'play'; g.pending = 0; g.drew = false;
  g.callable = null; g.chooser = null; g.wildKind = null; g.challenge = null; g.wild4 = null;
  g.said = hands.map(() => false);
  if (extra) Object.keys(extra).forEach(k => { g[k] = extra[k]; });
  return g;
}
/* أرقام الورق المفيدة في الفحوص (انظر رأس الصفحة: اللون × 25) */
const RED = 0, BLUE = 25, GREEN = 50, YELLOW = 75;   // الصفر من كل لون
const num = (base, v) => base + 1 + (v - 1) * 2;      // أولى نسختي الرقم v
const num2 = (base, v) => base + 2 + (v - 1) * 2;     // والثانية — ورقتان متطابقتان
const SKIP = b => b + 19, REV = b => b + 21, D2 = b => b + 23;
const WILD = 100, WILD4 = 104;

/* ---------- ٢- الرزمة: 108 ورقة، 25 لكل لون --------------------------- */
{
  const g = S.createGame({ seats: 4, seed: 42 }).state;
  ok('the deck is 108 distinct cards', conserved(g));
  const per = { red: 0, blue: 0, green: 0, yellow: 0 }, kinds = {};
  for (let k = 0; k < 108; k++) {
    const c = S.card(k);
    if (c.colour) per[c.colour]++;
    kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  }
  eq('25 cards in each colour', per, { red: 25, blue: 25, green: 25, yellow: 25 });
  eq('the kinds are 76 numbers, 8 of each action, 4+4 wild',
    kinds, { number: 76, skip: 8, reverse: 8, draw2: 8, wild: 4, wild4: 4 });
  const zeros = [], nines = [];
  for (let k = 0; k < 100; k++) {
    const c = S.card(k);
    if (c.kind === 'number' && c.value === 0) zeros.push(k);
    if (c.kind === 'number' && c.value === 9) nines.push(k);
  }
  ok('one zero per colour, two nines per colour', zeros.length === 4 && nines.length === 8);
  eq('every hand is dealt seven', g.hands.map(h => h.length), [7, 7, 7, 7]);
}

/* ---------- ٣- «عكس» تعمل عمل «وقّف» في لعبة اثنين -------------------- */
{
  const g = rig(2, [[REV(RED), num(RED, 5)], [num(BLUE, 3), num(BLUE, 4)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: REV(RED) });
  ok('two players: reverse gives the turn back to the player', !r.error && r.state.turn === 0, r.error || ('turn ' + r.state.turn));
  ok('two players: reverse is reported as a skip of the other seat',
    !r.error && r.events.some(e => e.t === 'skipped' && e.seat === 1));

  const h = rig(3, [[REV(RED), num(RED, 5)], [num(BLUE, 3)], [num(GREEN, 3)]], num(RED, 9), 'red');
  const q = S.applyAction(h, 0, { type: 'play', card: REV(RED) });
  ok('three players: reverse turns play the other way', !q.error && q.state.turn === 2 && q.state.dir === -1,
    q.error || ('turn ' + q.state.turn + ' dir ' + q.state.dir));
}

/* ---------- ٤- «وقّف» و«سحب ثنتين» ------------------------------------ */
{
  const g = rig(3, [[SKIP(RED), num(RED, 2)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: SKIP(RED) });
  ok('skip passes the seat after it', !r.error && r.state.turn === 2, r.error);

  const h = rig(3, [[D2(RED), num(RED, 2)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red');
  const q = S.applyAction(h, 0, { type: 'play', card: D2(RED) });
  ok('draw two: the next seat draws two and loses the turn',
    !q.error && q.state.hands[1].length === 3 && q.state.turn === 2,
    q.error || (q.state.hands[1].length + ' cards, turn ' + q.state.turn));
  ok('a draw two does not carry over without the house switch', !q.error && q.state.pending === 0);
}

/* ---------- ٥- الاعتراض على «سحب أربعة» بشقّيه ------------------------ */
{
  /* كاذب: بيده ورقةٌ حمراء واللون أحمر */
  const g = rig(2, [[WILD4, num(RED, 5), num(BLUE, 5)], [num(BLUE, 1), num(GREEN, 1)]], num(RED, 9), 'red');
  let r = S.applyAction(g, 0, { type: 'play', card: WILD4, colour: 'blue' });
  ok('the liar is allowed to play the four — the rule is the challenge, not the block', !r.error, r.error);
  ok('a wild four opens the challenge to the seat facing it',
    !r.error && r.state.phase === 'challenge' && r.state.challenge.target === 1);
  const c = S.applyAction(r.state, 1, { type: 'challenge' });
  ok('caught bluffing: the liar draws four', !c.error && c.state.hands[0].length === 2 + 4, c.error);
  ok('caught bluffing: the challenger draws nothing and plays on',
    !c.error && c.state.hands[1].length === 2 && c.state.turn === 1);
  ok('caught bluffing: the event says so, and carries the hand shown',
    !c.error && c.events.some(e => e.t === 'challenged' && e.bluff === true && e.hand.length === 2));

  /* صادق: ليس بيده حمراء */
  const h = rig(2, [[WILD4, num(BLUE, 5), num(GREEN, 5)], [num(BLUE, 1), num(GREEN, 1)]], num(RED, 9), 'red');
  let q = S.applyAction(h, 0, { type: 'play', card: WILD4, colour: 'blue' });
  const d = S.applyAction(q.state, 1, { type: 'challenge' });
  ok('a true four: the challenger draws six', !d.error && d.state.hands[1].length === 2 + 6, d.error);
  ok('a true four: the challenger loses the turn too',
    !d.error && d.state.turn === 0 && d.events.some(e => e.t === 'skipped' && e.seat === 1));
  ok('a wild in hand never makes a four a bluff', S.wild4Legal([WILD, WILD4, num(BLUE, 3)], 'red') === true);
  ok('a number of the colour in play does make it a bluff', S.wild4Legal([num(RED, 3)], 'red') === false);
  ok('a number of another colour does not', S.wild4Legal([num(BLUE, 3)], 'red') === true);

  /* ومن لم يعترض أخذ الأربع وخسر دوره */
  const e = S.applyAction(q.state, 1, { type: 'accept' });
  ok('accepting the four: draw four and lose the turn',
    !e.error && e.state.hands[1].length === 6 && e.state.turn === 0, e.error);
}

/* ---------- ٦- عقوبة من لم يقل «واحدة» -------------------------------- */
{
  const g = rig(3, [[num(RED, 5), num(RED, 6)], [num(BLUE, 5), num(GREEN, 2), num(YELLOW, 2)], [num(GREEN, 1)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: num(RED, 5) });        // بلا قولها
  ok('a hand that falls to one without the call is open to a call-out',
    !r.error && r.state.callable === 0 && r.state.said[0] === false, r.error);
  const c = S.applyAction(r.state, 1, { type: 'callOut', on: 0 });
  ok('the call-out costs two cards', !c.error && c.state.hands[0].length === 3, c.error);
  ok('the call-out shuts its own window', !c.error && c.state.callable === null);
  const again = S.applyAction(c.state, 2, { type: 'callOut', on: 0 });
  eq('there is nothing left to call', again.error, 'nothingToCall');

  /* ومن قالها فلا عقوبة */
  const h = S.applyAction(g, 0, { type: 'play', card: num(RED, 5), sayOne: true });
  ok('saying it closes the window before it opens', !h.error && h.state.callable === null && h.state.said[0] === true);
  eq('calling out a player who said it is refused',
    S.applyAction(h.state, 1, { type: 'callOut', on: 0 }).error, 'nothingToCall');

  /* والنافذة تُغلق بأوّل فعلٍ من مقعدٍ آخر */
  const p = S.applyAction(r.state, 1, { type: 'play', card: num(BLUE, 5) });
  ok('the next seat acting shuts the window', !p.error && p.state.callable === null, p.error);
  eq('and the call is then too late',
    S.applyAction(p.state, 2, { type: 'callOut', on: 0 }).error, 'nothingToCall');

  /* ومن تذكّر قبل أن يُمسك نجا */
  const m = S.applyAction(r.state, 0, { type: 'sayOne' });
  ok('remembering in time saves you', !m.error && m.state.said[0] === true && m.state.callable === null, m.error);
  eq('you cannot call yourself', S.applyAction(r.state, 0, { type: 'callOut', on: 0 }).error, 'cannotCallYourself');
}

/* ---------- ٧- حساب النقاط -------------------------------------------- */
{
  eq('a number is worth its face', S.points(num(GREEN, 7)), 7);
  eq('a zero is worth nothing', S.points(GREEN), 0);
  eq('skip is twenty', S.points(SKIP(BLUE)), 20);
  eq('reverse is twenty', S.points(REV(BLUE)), 20);
  eq('draw two is twenty', S.points(D2(BLUE)), 20);
  eq('wild is fifty', S.points(WILD), 50);
  eq('wild draw four is fifty', S.points(WILD4), 50);
  eq('a hand adds up', S.handScore([num(RED, 9), SKIP(RED), WILD4]), 9 + 20 + 50);

  /* جولةٌ تنتهي: الفائز يأخذ ما في الأيدي كلّها */
  const g = rig(3, [[num(RED, 5)], [num(BLUE, 1), WILD], [SKIP(GREEN), num(GREEN, 4)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: num(RED, 5), sayOne: true });
  ok('going out ends the round', !r.error && r.state.phase === 'over' && r.state.winner === 0, r.error);
  eq('the winner takes every other hand', r.state.scores[0], 1 + 50 + 20 + 4);
  eq('the round-ended event breaks it down per seat',
    r.events.find(e => e.t === 'roundEnded').perSeat, [0, 51, 24]);
  eq('a round short of the target does not end the match', r.state.over, false);

  const big = rig(2, [[num(RED, 5)], [WILD, WILD, WILD, WILD, WILD, WILD, WILD, WILD, WILD, WILD]], num(RED, 9), 'red');
  const w = S.applyAction(big, 0, { type: 'play', card: num(RED, 5), sayOne: true });
  ok('five hundred ends the match', !w.error && w.state.over === true && w.state.scores[0] === 500, w.error);
}

/* ---------- ٨- نفاد المسحب -------------------------------------------- */
{
  const g = rig(2, [[num(BLUE, 3)], [num(GREEN, 3)]], num(RED, 9), 'red');
  /* كل ما ليس في يدٍ ولا على المرمى يُلقى في المرميّ، فالمسحب خالٍ تماماً */
  g.discard = [num(RED, 9)].concat(g.stock);
  g.stock = [];
  const r = S.applyAction(g, 0, { type: 'draw' });
  ok('an empty stock is refilled from the discard', !r.error && r.state.hands[0].length === 2, r.error);
  ok('the refill is announced', !r.error && r.events.some(e => e.t === 'stockReshuffled'));
  ok('the top card stays on the discard', !r.error && r.state.discard.length === 1 && r.state.discard[0] === g.discard[g.discard.length - 1]);
  ok('no card is lost or invented in the refill', !r.error && conserved(r.state));

  /* ولا شيء يُخلط: كل الورق في الأيدي */
  const h = rig(2, [[num(BLUE, 3)], [num(GREEN, 3)]], num(RED, 9), 'red');
  h.hands[1] = h.hands[1].concat(h.stock);
  h.stock = [];
  const q = S.applyAction(h, 0, { type: 'draw' });
  ok('a stock that cannot be refilled hands over nothing, and says so',
    !q.error && q.events.some(e => e.t === 'drew' && e.n === 0), q.error);
  ok('and the seat can still pass, so no round deadlocks',
    !q.error && !S.applyAction(q.state, 0, { type: 'pass' }).error);
  ok('nothing was conjured', !q.error && conserved(q.state));
}

/* ---------- ٩- الأفعال المرفوضة، بلا رمي استثناء ---------------------- */
{
  const g = rig(3, [[num(RED, 5)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red');
  eq('a seat that is not on turn is refused',
    S.applyAction(g, 1, { type: 'play', card: num(BLUE, 1) }).error, 'notYourTurn');
  eq('a card that is not in the hand is refused',
    S.applyAction(g, 0, { type: 'play', card: num(BLUE, 1) }).error, 'notInHand');
  eq('a card that does not match is refused',
    S.applyAction(rig(3, [[num(BLUE, 5)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red'),
      0, { type: 'play', card: num(BLUE, 5) }).error, 'cardDoesNotMatch');
  eq('an action outside the list is refused', S.applyAction(g, 0, { type: 'flip' }).error, 'unknownAction');
  eq('a malformed action is refused', S.applyAction(g, 0, null).error, 'unknownAction');
  eq('a card id that is not a number is refused',
    S.applyAction(g, 0, { type: 'play', card: 'red 5' }).error, 'noSuchCard');
  eq('a seat that does not exist is refused', S.applyAction(g, 9, { type: 'draw' }).error, 'noSuchSeat');
  eq('a seat that is not a whole number is refused', S.applyAction(g, 1.5, { type: 'draw' }).error, 'noSuchSeat');
  eq('drawing twice in one turn is refused',
    S.applyAction(S.applyAction(g, 0, { type: 'draw' }).state, 0, { type: 'draw' }).error, 'alreadyDrew');
  eq('passing before drawing is refused', S.applyAction(g, 0, { type: 'pass' }).error, 'drawFirst');
  eq('a colour outside the four is refused',
    S.applyAction(S.applyAction(rig(2, [[WILD, num(RED, 2)], [num(BLUE, 1)]], num(RED, 9), 'red'),
      0, { type: 'play', card: WILD }).state, 0, { type: 'colour', colour: 'gold' }).error, 'noSuchColour');
  ok('a refused action leaves the state untouched',
    JSON.stringify(g) === JSON.stringify(rig(3, [[num(RED, 5)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red')));
  let threw = false;
  try { S.applyAction(undefined, 0, { type: 'draw' }); } catch (e) { threw = true; }
  ok('no action throws, not even against no state at all', !threw);
}

/* ---------- ١٠- viewFor لا تسرّب يد غيرك ------------------------------ */
{
  const g = rig(3, [[num(RED, 5), WILD], [num(BLUE, 1), num(BLUE, 2), WILD4], [num(GREEN, 1)]], num(RED, 9), 'red');
  const v = S.viewFor(g, 0);
  const banned = ['hands', 'stock', 'rng', 'seed', 'wild4', 'legal'];
  const found = [];
  (function scan(o) {
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(k => { if (banned.indexOf(k) >= 0) found.push(k); scan(o[k]); });
  })(v);
  eq('the view carries no hidden key at any depth', found, []);
  eq('you see your own hand whole', v.hand, g.hands[0]);
  eq('you see only how many the others hold', v.counts, [2, 3, 1]);
  eq('you see how big the stock is, not what is in it', v.stockCount, g.stock.length);
  ok('the discard is public and stays', JSON.stringify(v.discard) === JSON.stringify(g.discard));
  /* ورقةٌ في يد غيرك لا تظهر في رؤيتك بحالٍ — تُفحص بالمسح لا بالقراءة */
  const mine = new Set(v.hand.concat(v.discard));
  const theirs = g.hands[1].concat(g.hands[2]).filter(c => !mine.has(c));
  const nums = [];
  (function harvest(o) {
    if (typeof o === 'number') { nums.push(o); return; }
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(k => harvest(o[k]));
  })({ a: v.hand, b: v.discard, c: v.counts, d: v.scores, e: v.stockCount });
  ok('no card of another hand appears anywhere you may look',
    theirs.every(c => v.hand.indexOf(c) < 0 && v.discard.indexOf(c) < 0), theirs.join(' '));
  ok('a view is still plain JSON', JSON.stringify(v) === JSON.stringify(JSON.parse(JSON.stringify(v))));

  /* وحقيقةُ «سحب أربعة» — أكان كذباً — لا تصل حتى إلى المعترض */
  const p = S.applyAction(rig(2, [[WILD4, num(RED, 5)], [num(BLUE, 1), num(BLUE, 2)]], num(RED, 9), 'red'),
    0, { type: 'play', card: WILD4, colour: 'blue' });
  ok('the host knows whether the four was a bluff', p.state.challenge.legal === false);
  ok('the challenger does not', S.viewFor(p.state, 1).challenge.legal === undefined);
  ok('and neither does anyone else', S.viewFor(p.state, 0).challenge.legal === undefined);
  ok('the host asking for everything gets everything', S.viewFor(p.state, null).challenge.legal === false);
}

/* ---------- ١١- الحتمية والتسلسل ------------------------------------- */
{
  const a = S.createGame({ seats: 4, seed: 2026 }).state;
  const b = S.createGame({ seats: 4, seed: 2026 }).state;
  const c = S.createGame({ seats: 4, seed: 2027 }).state;
  ok('one seed deals one game', JSON.stringify(a) === JSON.stringify(b));
  ok('another seed deals another', JSON.stringify(a) !== JSON.stringify(c));
  ok('the state is plain JSON with no cycles',
    JSON.stringify(a) === JSON.stringify(JSON.parse(JSON.stringify(a))));
  const keys = Object.keys(a).filter(k => typeof a[k] === 'function');
  eq('and carries no function', keys, []);

  /* نفس البذرة ونفس الأفعال ونفس النتيجة — حتى بعد إعادة الحالة من نصّها */
  function replay() {
    let st = S.createGame({ seats: 3, seed: 99 }).state;
    for (let k = 0; k < 12; k++) {
      st = JSON.parse(JSON.stringify(st));
      const me = st.phase === 'colour' ? st.chooser : (st.phase === 'challenge' ? st.challenge.target : st.turn);
      let act;
      if (st.phase === 'colour') act = { type: 'colour', colour: 'red' };
      else if (st.phase === 'challenge') act = { type: 'accept' };
      else {
        const can = S.legalMoves(S.viewFor(st, me));
        act = can.length ? { type: 'play', card: can[0], colour: 'red', sayOne: true }
          : (st.drew ? { type: 'pass' } : { type: 'draw' });
      }
      const out = S.applyAction(st, me, act);
      if (out.error) return 'refused:' + out.error;
      st = out.state;
      if (st.phase === 'over') break;
    }
    return JSON.stringify(st);
  }
  ok('a replay through a saved state lands in the same place', replay() === replay());
}

/* ---------- ١٢- قواعد البيت مطفأةٌ افتراضاً، وتعمل حين تُشعَل --------- */
{
  const off = S.createGame({ seats: 3, seed: 5 }).state;
  eq('the three house rules are off unless asked for', off.house, { stack: false, jumpIn: false, sevenZero: false });

  const g = rig(2, [[D2(RED), num(RED, 2)], [D2(BLUE), num(GREEN, 1)]], num(RED, 9), 'red', { house: { stack: true, jumpIn: false, sevenZero: false } });
  const r = S.applyAction(g, 0, { type: 'play', card: D2(RED) });
  ok('stacking on: the two waits instead of being taken', !r.error && r.state.pending === 2 && r.state.turn === 1, r.error);
  const s2 = S.applyAction(r.state, 1, { type: 'play', card: D2(BLUE) });
  ok('stacking on: a two answers a two and the pile grows', !s2.error && s2.state.pending === 4, s2.error);
  eq('stacking on: nothing else may be played over the pile',
    S.applyAction(r.state, 1, { type: 'play', card: num(GREEN, 1) }).error, 'mustTakeThePile');
  const take = S.applyAction(s2.state, 0, { type: 'draw' });
  ok('stacking on: whoever stops takes the lot', !take.error && take.state.hands[0].length === 5 && take.state.pending === 0, take.error);

  const j = rig(3, [[num(RED, 5)], [num(BLUE, 1)], [num2(RED, 9), num(GREEN, 4)]], num(RED, 9), 'red', { house: { stack: false, jumpIn: true, sevenZero: false } });
  const jr = S.applyAction(j, 2, { type: 'play', card: num2(RED, 9) });
  ok('jump-in on: an identical card may be played out of turn', !jr.error && jr.state.turn === 0, jr.error);
  eq('jump-in on: a card that is merely playable may not jump',
    S.applyAction(j, 1, { type: 'play', card: num(BLUE, 1) }).error, 'notIdentical');

  const z = rig(3, [[num(RED, 7), WILD], [num(BLUE, 1), num(BLUE, 2), num(BLUE, 3)], [num(GREEN, 1)]],
    num(RED, 9), 'red', { house: { stack: false, jumpIn: false, sevenZero: true } });
  eq('seven-zero on: a seven without a partner is refused',
    S.applyAction(z, 0, { type: 'play', card: num(RED, 7) }).error, 'needSwapTarget');
  const zr = S.applyAction(z, 0, { type: 'play', card: num(RED, 7), swapWith: 1 });
  ok('seven-zero on: the seven swaps two hands',
    !zr.error && zr.state.hands[0].length === 3 && zr.state.hands[1].length === 1, zr.error);

  const z0 = rig(3, [[RED, WILD], [num(BLUE, 1), num(BLUE, 2), num(BLUE, 3)], [num(GREEN, 1)]],
    num(RED, 9), 'red', { house: { stack: false, jumpIn: false, sevenZero: true } });
  const z0r = S.applyAction(z0, 0, { type: 'play', card: RED });
  ok('seven-zero on: the zero passes every hand along',
    !z0r.error && z0r.state.hands.map(h => h.length).join() === '3,1,1', z0r.error || z0r.state.hands.map(h => h.length).join());
}

/* ---------- ١٣- الورقة المكشوفة الأولى وأثرها ------------------------- */
{
  /* تُبحث بذورٌ حتى تُكشف كل حالة، فيُفحص كل فرعٍ بالأثر لا بالقراءة */
  const want = { number: 0, skip: 0, reverse: 0, draw2: 0, wild: 0 };
  let wild4Seen = 0;
  for (let s = 1; s <= 400; s++) {
    const out = S.createGame({ seats: 3, seed: s });
    const g = out.state, t = S.card(g.discard[g.discard.length - 1]);
    if (t.kind === 'wild4') wild4Seen++;
    want[t.kind] = (want[t.kind] || 0) + 1;
    /* يُفحص أوّلُ ظهورٍ لكل حالةٍ مرّةً واحدة، وباقي البذور تُعدّ فقط */
    if (t.kind === 'skip' && want.skip === 1)
      ok('opening skip: the first seat is skipped', g.turn === 1, 'turn ' + g.turn);
    if (t.kind === 'reverse' && want.reverse === 1)
      ok('opening reverse: play starts the other way', g.turn === 2 && g.dir === -1, 'turn ' + g.turn + ' dir ' + g.dir);
    if (t.kind === 'draw2' && want.draw2 === 1)
      ok('opening draw two: the first seat draws two and is skipped', g.hands[0].length === 9 && g.turn === 1, g.hands[0].length + ' cards, turn ' + g.turn);
    if (t.kind === 'wild' && want.wild === 1)
      ok('opening wild: the first seat names the colour', g.phase === 'colour' && g.chooser === 0, g.phase);
  }
  ok('a wild draw four is never the card turned up', wild4Seen === 0);
  ok('every opening case was actually reached in four hundred deals',
    want.number > 0 && want.skip > 0 && want.reverse > 0 && want.draw2 > 0 && want.wild > 0,
    JSON.stringify(want));
  /* وبعد اختيار اللون على الحرّة المكشوفة، المُختار هو من يلعب */
  for (let s = 1; s <= 400; s++) {
    const g = S.createGame({ seats: 3, seed: s }).state;
    if (g.phase !== 'colour') continue;
    const r = S.applyAction(g, 0, { type: 'colour', colour: 'green' });
    ok('opening wild: the seat that named the colour then plays',
      !r.error && r.state.phase === 'play' && r.state.turn === 0 && r.state.colour === 'green', r.error);
    break;
  }
}

/* ---------- ١٤- ألف جولةٍ كاملة: لا عطب، ولا ورقةٌ تضيع --------------- */
{
  let finished = 0, broke = 0, worst = 0, conservedAll = true, errs = {};
  for (let s = 1; s <= 1000; s++) {
    const seats = 2 + (s % 4);
    let st = S.createGame({ seats: seats, seed: s * 7919 }).state;
    const pick = S.rng(s);                       // بذرةٌ للاعب الآلي نفسها كل مرّة
    let steps = 0;
    while (st.phase !== 'over' && steps < 4000) {
      steps++;
      if (!conserved(st)) { conservedAll = false; break; }
      const me = st.phase === 'colour' ? st.chooser
        : (st.phase === 'challenge' ? st.challenge.target : st.turn);
      let act;
      if (st.phase === 'colour') act = { type: 'colour', colour: S.COLOURS[Math.floor(pick() * 4)] };
      else if (st.phase === 'challenge') act = pick() < 0.5 ? { type: 'challenge' } : { type: 'accept' };
      else {
        const v = S.viewFor(st, me);
        const can = S.legalMoves(v);
        if (can.length && pick() < 0.92) {
          const id = can[Math.floor(pick() * can.length)];
          act = { type: 'play', card: id, colour: S.COLOURS[Math.floor(pick() * 4)], sayOne: pick() < 0.8 };
          if (st.house.sevenZero) act.swapWith = (me + 1) % st.seats;
        } else act = st.drew ? { type: 'pass' } : { type: 'draw' };
      }
      const out = S.applyAction(st, me, act);
      if (out.error) { errs[out.error] = (errs[out.error] || 0) + 1; broke++; break; }
      st = out.state;
    }
    if (steps > worst) worst = steps;
    if (st.phase === 'over') finished++;
  }
  ok('a thousand rounds run end to end with nothing refused', broke === 0, JSON.stringify(errs));
  ok('every one of them reached a winner', finished === 1000, finished + '/1000, longest ' + worst + ' actions');
  ok('108 cards are still 108 at every step of all of them', conservedAll);
}

/* ---------- ١٥- الجولة التالية ---------------------------------------- */
{
  const g = rig(3, [[num(RED, 5)], [num(BLUE, 1), WILD], [SKIP(GREEN)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: num(RED, 5), sayOne: true });
  const n = S.nextRound(r.state);
  ok('the next round deals again and keeps the score',
    !n.error && n.state.round === 2 && n.state.scores[0] === r.state.scores[0], n.error);
  eq('the next round starts one seat along', n.state.turn === 1 || n.state.phase === 'colour', true);
  ok('the next round is a whole deck again', conserved(n.state));
  eq('a round still running cannot be skipped', S.nextRound(g).error, 'roundNotOver');
  eq('an action into a finished round is refused',
    S.applyAction(r.state, 1, { type: 'draw' }).error, 'roundOver');
}

console.log(bad ? '\n' + bad + ' FAILED of ' + ran : '\nALL PASS — ' + ran + ' checks');
process.exit(bad ? 1 : 0);
