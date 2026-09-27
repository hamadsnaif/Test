/* محرّك شدّة — فحوصٌ حتمية بالبذرة، بلا متصفّح.
 *
 *   node src/tests/shadda.js
 *
 * المحرّك يعيش داخل src/games/shadda.html بين علامتين، فيُقتطع منه ويُشغَّل في
 * سياقٍ خالٍ بـvm: لا document ولا window ولا نافذةَ متصفّحٍ أصلاً. فإن أشار
 * المحرّك إلى شيءٍ من ذلك سقط هنا بصوتٍ عالٍ — وهذا أوّل ما يُفحص.
 *
 * وأُعيدت كتابته في المرحلة ٥، حين صارت قواعد بيت المالك هي الأصل: قفلُ الورقة
 * العادية الأخيرة، وتراكمُ «سحب أربعة» بنوعها، وحذفُ «واحدة» والاعتراض. فحوصُ
 * القواعد الزائلة حُذفت لأن قواعدها زالت لا لأنها سقطت، ومكانها فحوصُ القواعد
 * الجديدة. والعمودان اللذان لا يتغيّران باقيان: ‏١٠٨‏ ورقة لا تنقص ولا تزيد في
 * أي خطوة، وحتميّةُ البذرة.
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
/* حالةٌ مصنوعةٌ باليد: الحالة JSON صِرف، فتعديلها مشروعٌ في فحص — وهو الشيء
   الوحيد الذي يجعل قاعدةً كالقفل تُفحص بيدٍ بعينها لا بالصدفة. */
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
  g.turn = 0; g.dir = 1; g.phase = 'play'; g.pending = 0; g.pendingKind = null; g.drew = false;
  g.chooser = null; g.wildKind = null;
  if (extra) Object.keys(extra).forEach(k => { g[k] = extra[k]; });
  return g;
}
const EASY = { house: { easy: true, jumpIn: false, sevenZero: false } };
/* أرقام الورق المفيدة في الفحوص (انظر رأس الصفحة: اللون × 25) */
const RED = 0, BLUE = 25, GREEN = 50, YELLOW = 75;   // الصفر من كل لون
const num = (base, v) => base + 1 + (v - 1) * 2;      // أولى نسختي الرقم v
const num2 = (base, v) => base + 2 + (v - 1) * 2;     // والثانية — ورقتان متطابقتان
const SKIP = b => b + 19, REV = b => b + 21, D2 = b => b + 23;
const WILD = 100, WILD2 = 101, WILD4 = 104, WILD4B = 105;

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

/* ---------- ٤- «وقّف» ------------------------------------------------- */
{
  const g = rig(3, [[SKIP(RED), num(RED, 2)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: SKIP(RED) });
  ok('skip passes the seat after it', !r.error && r.state.turn === 2, r.error);
}

/* ================================================================== *
 * ٥- الورقة العادية الأخيرة مقفلة — قاعدة المالك، بيدٍ مصنوعة
 *
 * القويّ: سحب أربعة · سحب ثنتين · تغيير اللون.  والعاديّ: الأرقام و«وقّف»
 * و«عكس».  ومن لم يبق من عاديّه إلا واحدةٌ ومعها قويٌّ فأكثر، فتلك مقفلة.
 * ================================================================== */
{
  const TOP = num(RED, 9);

  /* عاديّةٌ واحدة ومعها قويّ ⇒ مقفلة، ولو طابقت اللون أو الرقم */
  const one = rig(2, [[WILD4, num(GREEN, 9)], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  eq('one plain card beside a strong one cannot be played, even though it matches',
    S.applyAction(one, 0, { type: 'play', card: num(GREEN, 9) }).error, 'lastPlainLocked');
  ok('but the strong card itself is free to play',
    !S.applyAction(one, 0, { type: 'play', card: WILD4, colour: 'blue' }).error);
  ok('and drawing is still open to that seat',
    !S.applyAction(one, 0, { type: 'draw' }).error);
  eq('the locked card is not among the legal moves either',
    S.legalMoves(S.viewFor(one, 0)), [WILD4]);

  /* قويّان ومعهما عاديّةٌ واحدة ⇒ مقفلةٌ كذلك */
  const two = rig(2, [[WILD4, WILD, num(GREEN, 9)], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  eq('two strong cards beside one plain lock it just the same',
    S.applyAction(two, 0, { type: 'play', card: num(GREEN, 9) }).error, 'lastPlainLocked');

  /* عاديّتان ⇒ لا تنطبق */
  const pair = rig(2, [[num(GREEN, 9), num(RED, 3), WILD4], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  ok('two plain cards in hand: neither is locked',
    !S.applyAction(pair, 0, { type: 'play', card: num(GREEN, 9) }).error &&
    !S.applyAction(pair, 0, { type: 'play', card: num(RED, 3) }).error);
  eq('and both stand in the legal moves with the strong card',
    S.legalMoves(S.viewFor(pair, 0)).slice().sort((a, b) => a - b),
    [num(RED, 3), num(GREEN, 9), WILD4].sort((a, b) => a - b));

  /* لا عاديّة أصلاً ⇒ لا تنطبق */
  const none = rig(2, [[WILD4, WILD], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  ok('a hand of nothing but strong cards is not locked out of anything',
    !S.applyAction(none, 0, { type: 'play', card: WILD, colour: 'blue' }).error);

  /* عاديّةٌ واحدة بلا قويّ ⇒ لا تنطبق، فلا أحد يُمنع من الخروج */
  const last = rig(2, [[num(GREEN, 9)], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  const out = S.applyAction(last, 0, { type: 'play', card: num(GREEN, 9) });
  ok('your very last card is never locked — the rule can never stop a player going out',
    !out.error && out.state.phase === 'over' && out.state.winner === 0, out.error);

  /* «وقّف» و«عكس» عاديّتان: تُطابَقان كما يُطابَق الرقم */
  const sk = rig(2, [[WILD4, SKIP(RED)], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  eq('a Skip is plain, so it locks like a number does',
    S.applyAction(sk, 0, { type: 'play', card: SKIP(RED) }).error, 'lastPlainLocked');
  const rv = rig(2, [[WILD4, REV(RED)], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  eq('and so does a Reverse', S.applyAction(rv, 0, { type: 'play', card: REV(RED) }).error, 'lastPlainLocked');

  /* و«سحب ثنتين» قويّة: هي التي تقفل غيرها ولا تُقفل */
  const d2 = rig(2, [[D2(RED), num(GREEN, 9)], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red');
  eq('a Draw Two is strong, so the last plain beside it is locked',
    S.applyAction(d2, 0, { type: 'play', card: num(GREEN, 9) }).error, 'lastPlainLocked');
  ok('and the Draw Two itself plays', !S.applyAction(d2, 0, { type: 'play', card: D2(RED) }).error);

  /* الدالّة الخالصة نفسها، مسؤولةً وحدها */
  ok('strong() names the three strong cards and nothing else',
    S.strong(WILD4) && S.strong(WILD) && S.strong(D2(RED)) &&
    !S.strong(num(RED, 5)) && !S.strong(SKIP(RED)) && !S.strong(REV(RED)));
  ok('locked() is a pure question about a hand',
    S.locked([WILD4, num(GREEN, 9)], num(GREEN, 9)) === true &&
    S.locked([WILD4, num(GREEN, 9)], WILD4) === false &&
    S.locked([num(RED, 3), num(GREEN, 9)], num(GREEN, 9)) === false &&
    S.locked([num(GREEN, 9)], num(GREEN, 9)) === false);

  /* ومفتاح «لعبٌ مُيسَّر» يرفعه */
  const easy = rig(2, [[WILD4, num(GREEN, 9)], [num(BLUE, 1), num(BLUE, 2)]], TOP, 'red', EASY);
  ok('with the eased switch on, that same last plain card plays',
    !S.applyAction(easy, 0, { type: 'play', card: num(GREEN, 9) }).error);
  eq('and it stands in the legal moves too',
    S.legalMoves(S.viewFor(easy, 0)).slice().sort((a, b) => a - b), [num(GREEN, 9), WILD4].sort((a, b) => a - b));
}

/* ================================================================== *
 * ٦- التراكم: ثنتان على ثنتين، وأربع على أربع، ولا تُخلطان
 * ================================================================== */
{
  /* «سحب ثنتين» تتراكم — وهذا الآن أصلٌ لا مفتاح */
  const g = rig(3, [[D2(RED), num(RED, 2)], [D2(BLUE), num(GREEN, 1)], [num(YELLOW, 4), num(YELLOW, 5)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: D2(RED) });
  ok('a Draw Two waits on the table instead of being taken at once',
    !r.error && r.state.pending === 2 && r.state.pendingKind === 'draw2' && r.state.turn === 1, r.error);
  const r2 = S.applyAction(r.state, 1, { type: 'play', card: D2(BLUE) });
  ok('a Draw Two of any colour answers it, and the pile grows',
    !r2.error && r2.state.pending === 4 && r2.state.pendingKind === 'draw2', r2.error);
  eq('nothing else may be played over a pile of twos',
    S.applyAction(r.state, 1, { type: 'play', card: num(GREEN, 1) }).error, 'mustAnswerTwos');
  eq('and you cannot pass out from under it either',
    S.applyAction(r.state, 1, { type: 'pass' }).error, 'mustAnswerTwos');
  const take = S.applyAction(r2.state, 2, { type: 'draw' });
  ok('whoever stops answering takes the whole sum and stands their turn',
    !take.error && take.state.hands[2].length === 2 + 4 && take.state.pending === 0 &&
    take.state.pendingKind === null && take.events.some(e => e.t === 'skipped' && e.seat === 2), take.error);

  /* «سحب أربعة» تتراكم كذلك — وهذا هو المنقلب عن المرحلة ١ */
  const w = rig(3, [[WILD4, num(RED, 2)], [WILD4B, num(GREEN, 1)], [num(YELLOW, 4), num(YELLOW, 5)]], num(RED, 9), 'red');
  const w1 = S.applyAction(w, 0, { type: 'play', card: WILD4, colour: 'blue' });
  ok('a Wild Draw Four waits on the table as a pile of four',
    !w1.error && w1.state.pending === 4 && w1.state.pendingKind === 'wild4' &&
    w1.state.turn === 1 && w1.state.colour === 'blue', w1.error);
  const w2 = S.applyAction(w1.state, 1, { type: 'play', card: WILD4B, colour: 'green' });
  ok('a four answers a four, and eight are owed',
    !w2.error && w2.state.pending === 8 && w2.state.pendingKind === 'wild4', w2.error);
  const wt = S.applyAction(w2.state, 2, { type: 'draw' });
  ok('and whoever stops takes all eight and stands',
    !wt.error && wt.state.hands[2].length === 2 + 8 && wt.state.pending === 0, wt.error);

  /* ولا تُخلط الكومتان: لكلٍّ نوعها */
  const mix = rig(3, [[WILD4, num(RED, 2)], [D2(BLUE), num(GREEN, 1)], [num(YELLOW, 4)]], num(RED, 9), 'red');
  const m1 = S.applyAction(mix, 0, { type: 'play', card: WILD4, colour: 'blue' });
  eq('a Draw Two may not answer a pile of fours',
    S.applyAction(m1.state, 1, { type: 'play', card: D2(BLUE) }).error, 'mustAnswerFours');
  const mix2 = rig(3, [[D2(RED), num(RED, 2)], [WILD4, num(GREEN, 1)], [num(YELLOW, 4)]], num(RED, 9), 'red');
  const m2 = S.applyAction(mix2, 0, { type: 'play', card: D2(RED) });
  eq('and a Wild Draw Four may not answer a pile of twos',
    S.applyAction(m2.state, 1, { type: 'play', card: WILD4, colour: 'blue' }).error, 'mustAnswerTwos');

  /* والكومة القائمة لا يُقفل الردُّ عليها: القويّ لا يُقفل أصلاً */
  const lockPile = rig(3, [[D2(RED), num(RED, 2)], [D2(BLUE), num(GREEN, 1)], [num(YELLOW, 4)]], num(RED, 9), 'red');
  const lp = S.applyAction(lockPile, 0, { type: 'play', card: D2(RED) });
  ok('answering a pile is never blocked by the lock — a strong card is never locked',
    !S.applyAction(lp.state, 1, { type: 'play', card: D2(BLUE) }).error);

  /* والمفتاح المطفأ يعيد ما كان: الأربعة تُؤخذ في حينها بلا تراكم */
  const easy = rig(3, [[WILD4, num(RED, 2)], [WILD4B, num(GREEN, 1)], [num(YELLOW, 4)]], num(RED, 9), 'red', EASY);
  const e1 = S.applyAction(easy, 0, { type: 'play', card: WILD4, colour: 'blue' });
  ok('with the eased switch on a four is taken at once by the next seat, who is skipped',
    !e1.error && e1.state.pending === 0 && e1.state.hands[1].length === 2 + 4 && e1.state.turn === 2, e1.error);
  ok('and the eased four leaves no pile behind it', !e1.error && e1.state.pendingKind === null);
  /* ولكن تكديس «سحب ثنتين» أصلٌ في الوضعين — المفتاح لا يمسّه */
  const easy2 = rig(3, [[D2(RED), num(RED, 2)], [D2(BLUE), num(GREEN, 1)], [num(YELLOW, 4)]], num(RED, 9), 'red', EASY);
  const e2 = S.applyAction(easy2, 0, { type: 'play', card: D2(RED) });
  ok('the eased switch does not touch the stacking of twos — that is the rule now, not an option',
    !e2.error && e2.state.pending === 2 && e2.state.pendingKind === 'draw2', e2.error);
}

/* ---------- ٧- لا أثر لـ«واحدة» ولا للاعتراض ------------------------- */
{
  eq('the action list is exactly the four that are left', S.ACTIONS, ['play', 'draw', 'pass', 'colour']);
  const g = rig(3, [[num(RED, 5), num(RED, 6)], [num(BLUE, 5)], [num(GREEN, 1)]], num(RED, 9), 'red');
  ['sayOne', 'callOut', 'challenge', 'accept'].forEach(t => {
    eq('«' + t + '» is no longer an action at all', S.applyAction(g, 0, { type: t, on: 1 }).error, 'unknownAction');
  });
  const r = S.applyAction(g, 0, { type: 'play', card: num(RED, 5) });
  const keys = Object.keys(r.state);
  ['said', 'callable', 'challenge', 'wild4'].forEach(k => {
    ok('the state carries no «' + k + '» any more', keys.indexOf(k) < 0, keys.join(' '));
  });
  ok('and no event says a word about either of them',
    !r.events.some(e => e.t === 'saidOne' || e.t === 'challenged'), JSON.stringify(r.events.map(e => e.t)));
  ok('the engine source itself is clean of both systems',
    !/sayOne|callOut|challenged|wild4Legal|callable/.test(CODE), 'still in the source');
  ok('a hand falling to one is just a hand of one — nothing opens, nothing is owed',
    !r.error && r.state.hands[0].length === 1 && r.state.turn === 1, r.error);
  /* و«سحب أربعة» تُلعب فوق أي ورقةٍ في دورك، بلا شرطٍ ولا سؤال */
  const bluff = rig(2, [[WILD4, num(RED, 5), num(RED, 6)], [num(BLUE, 1), num(BLUE, 2)]], num(RED, 9), 'red');
  const b = S.applyAction(bluff, 0, { type: 'play', card: WILD4, colour: 'blue' });
  ok('a Wild Draw Four plays over anything on your turn, holding the colour or not',
    !b.error && b.state.pending === 4, b.error);
}

/* ---------- ٨- حساب النقاط -------------------------------------------- */
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
  const r = S.applyAction(g, 0, { type: 'play', card: num(RED, 5) });
  ok('going out ends the round', !r.error && r.state.phase === 'over' && r.state.winner === 0, r.error);
  eq('the winner takes every other hand', r.state.scores[0], 1 + 50 + 20 + 4);
  eq('the round-ended event breaks it down per seat',
    r.events.find(e => e.t === 'roundEnded').perSeat, [0, 51, 24]);
  eq('a round short of the target does not end the match', r.state.over, false);

  /* ثمانيةُ حرٍّ (‏٥٠‏ لكل) وخمسةُ فعلٍ (‏٢٠‏ لكل) = ‏٥٠٠‏ بالضبط */
  const big = rig(2, [[num(RED, 5)], [100, 101, 102, 103, 104, 105, 106, 107,
    SKIP(RED), REV(RED), D2(RED), SKIP(BLUE), REV(BLUE)]], num(RED, 9), 'red');
  const w = S.applyAction(big, 0, { type: 'play', card: num(RED, 5) });
  ok('five hundred ends the match', !w.error && w.state.over === true && w.state.scores[0] === 500, w.error || w.state.scores[0]);
  const target = rig(2, [[num(RED, 5)], [WILD, WILD2, WILD4, WILD4B]], num(RED, 9), 'red', { target: 200 });
  const t = S.applyAction(target, 0, { type: 'play', card: num(RED, 5) });
  ok('reaching the target ends the match, and says so',
    !t.error && t.state.over === true && t.state.scores[0] === 200 &&
    t.events.some(e => e.t === 'matchEnded'), t.error || t.state.scores[0]);
}

/* ---------- ٩- نفاد المسحب -------------------------------------------- */
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

/* ---------- ١٠- الأفعال المرفوضة، بلا رمي استثناء --------------------- */
{
  const g = rig(3, [[num(RED, 5), num(RED, 6)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red');
  eq('a seat that is not on turn is refused',
    S.applyAction(g, 1, { type: 'play', card: num(BLUE, 1) }).error, 'notYourTurn');
  eq('a card that is not in the hand is refused',
    S.applyAction(g, 0, { type: 'play', card: num(BLUE, 1) }).error, 'notInHand');
  eq('a card that does not match is refused',
    S.applyAction(rig(3, [[num(BLUE, 5), num(BLUE, 6)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red'),
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
    S.applyAction(S.applyAction(rig(2, [[WILD, num(RED, 2), num(RED, 3)], [num(BLUE, 1)]], num(RED, 9), 'red'),
      0, { type: 'play', card: WILD }).state, 0, { type: 'colour', colour: 'gold' }).error, 'noSuchColour');
  ok('a refused action leaves the state untouched',
    JSON.stringify(g) === JSON.stringify(rig(3, [[num(RED, 5), num(RED, 6)], [num(BLUE, 1)], [num(GREEN, 1)]], num(RED, 9), 'red')));
  let threw = false;
  try { S.applyAction(undefined, 0, { type: 'draw' }); } catch (e) { threw = true; }
  ok('no action throws, not even against no state at all', !threw);
}

/* ---------- ١١- viewFor لا تسرّب يد غيرك ------------------------------ */
{
  const g = rig(3, [[num(RED, 5), WILD], [num(BLUE, 1), num(BLUE, 2), WILD4], [num(GREEN, 1)]], num(RED, 9), 'red');
  const v = S.viewFor(g, 0);
  const banned = ['hands', 'stock', 'rng', 'seed', 'wild4', 'legal', 'challenge', 'said'];
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
  ok('no card of another hand appears anywhere you may look',
    theirs.every(c => v.hand.indexOf(c) < 0 && v.discard.indexOf(c) < 0), theirs.join(' '));
  ok('a view is still plain JSON', JSON.stringify(v) === JSON.stringify(JSON.parse(JSON.stringify(v))));
  ok('the host asking for everything gets everything',
    JSON.stringify(S.viewFor(g, null)) === JSON.stringify(g));

  /* نوعُ الكومة علنيّ: من يواجهها يجب أن يعرف بماذا يردّ */
  const p = S.applyAction(rig(2, [[WILD4, num(RED, 5), num(RED, 6)], [num(BLUE, 1), num(BLUE, 2)]], num(RED, 9), 'red'),
    0, { type: 'play', card: WILD4, colour: 'blue' });
  eq('the kind of the pile is public — you cannot answer what you cannot see',
    S.viewFor(p.state, 1).pendingKind, 'wild4');
  eq('and legalMoves on that view offers only the cards that answer it',
    S.legalMoves(S.viewFor(p.state, 1)), []);
}

/* ---------- ١٢- الحتمية والتسلسل ------------------------------------- */
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
      const me = st.phase === 'colour' ? st.chooser : st.turn;
      let act;
      if (st.phase === 'colour') act = { type: 'colour', colour: 'red' };
      else {
        const can = S.legalMoves(S.viewFor(st, me));
        act = can.length ? { type: 'play', card: can[0], colour: 'red' }
          : (st.drew || st.pending > 0 ? (st.pending > 0 ? { type: 'draw' } : { type: 'pass' }) : { type: 'draw' });
      }
      const out = S.applyAction(st, me, act);
      if (out.error) return 'refused:' + out.error;
      st = out.state;
      if (st.phase === 'over') break;
    }
    return JSON.stringify(st);
  }
  const rp = replay();
  ok('a replay through a saved state lands in the same place', rp === replay() && rp.indexOf('refused:') !== 0, rp.slice(0, 60));
}

/* ---------- ١٣- المفاتيح: المُيسَّر والزائدتان ------------------------ */
{
  const off = S.createGame({ seats: 3, seed: 5 }).state;
  eq('the house rules of the owner are the rules — all three switches are off',
    off.house, { easy: false, jumpIn: false, sevenZero: false });

  const j = rig(3, [[num(RED, 5), num(RED, 6)], [num(BLUE, 1)], [num2(RED, 9), num(GREEN, 4)]], num(RED, 9), 'red', { house: { easy: false, jumpIn: true, sevenZero: false } });
  const jr = S.applyAction(j, 2, { type: 'play', card: num2(RED, 9) });
  ok('jump-in on: an identical card may be played out of turn', !jr.error && jr.state.turn === 0, jr.error);
  eq('jump-in on: a card that is merely playable may not jump',
    S.applyAction(j, 1, { type: 'play', card: num(BLUE, 1) }).error, 'notIdentical');
  /* والقفل يسري على القفزة كما يسري على كل لعب */
  const jl = rig(3, [[num(RED, 5), num(RED, 6)], [num(BLUE, 1)], [num2(RED, 9), WILD4]], num(RED, 9), 'red', { house: { easy: false, jumpIn: true, sevenZero: false } });
  eq('jump-in on: the lock still holds — you cannot jump with your last plain card',
    S.applyAction(jl, 2, { type: 'play', card: num2(RED, 9) }).error, 'lastPlainLocked');

  const z = rig(3, [[num(RED, 7), num(RED, 8)], [num(BLUE, 1), num(BLUE, 2), num(BLUE, 3)], [num(GREEN, 1)]],
    num(RED, 9), 'red', { house: { easy: false, jumpIn: false, sevenZero: true } });
  eq('seven-zero on: a seven without a partner is refused',
    S.applyAction(z, 0, { type: 'play', card: num(RED, 7) }).error, 'needSwapTarget');
  const zr = S.applyAction(z, 0, { type: 'play', card: num(RED, 7), swapWith: 1 });
  ok('seven-zero on: the seven swaps two hands',
    !zr.error && zr.state.hands[0].length === 3 && zr.state.hands[1].length === 1, zr.error);

  const z0 = rig(3, [[RED, num(RED, 8)], [num(BLUE, 1), num(BLUE, 2), num(BLUE, 3)], [num(GREEN, 1)]],
    num(RED, 9), 'red', { house: { easy: false, jumpIn: false, sevenZero: true } });
  const z0r = S.applyAction(z0, 0, { type: 'play', card: RED });
  ok('seven-zero on: the zero passes every hand along',
    !z0r.error && z0r.state.hands.map(h => h.length).join() === '3,1,1', z0r.error || z0r.state.hands.map(h => h.length).join());
}

/* ---------- ١٤- الورقة المكشوفة الأولى وأثرها ------------------------- */
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
      ok('opening draw two: nobody played it, so it is taken at once and no pile stands',
        g.hands[0].length === 9 && g.turn === 1 && g.pending === 0 && g.pendingKind === null,
        g.hands[0].length + ' cards, turn ' + g.turn + ' pending ' + g.pending);
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

/* ---------- ١٥- ألف جولةٍ كاملة: لا عطب، ولا ورقةٌ تضيع --------------- */
/* تُدار مرّتين: بالقواعد كما هي، ثم بالمفتاح المُيسَّر — فكلا الطريقين يجب أن
   ينتهي بفائز، ولا ورقةَ تضيع في أيٍّ منهما. */
function thousand(easy) {
  let finished = 0, broke = 0, worst = 0, conservedAll = true, errs = {}, locks = 0, piles = 0;
  for (let s = 1; s <= 1000; s++) {
    const seats = 2 + (s % 4);
    let st = S.createGame({ seats: seats, seed: s * 7919, house: { easy: easy } }).state;
    const pick = S.rng(s);                       // بذرةٌ للاعب الآلي نفسها كل مرّة
    let steps = 0;
    while (st.phase !== 'over' && steps < 6000) {
      steps++;
      if (!conserved(st)) { conservedAll = false; break; }
      const me = st.phase === 'colour' ? st.chooser : st.turn;
      let act;
      if (st.phase === 'colour') act = { type: 'colour', colour: S.COLOURS[Math.floor(pick() * 4)] };
      else {
        const v = S.viewFor(st, me);
        if (st.pending > 0) piles++;
        /* الورقة المقفلة تُعدّ: القاعدة ليست نظريّةً في ألف جولة */
        if (!easy && v.hand.some(id => S.locked(v.hand, id) && S.playable(id, v.colour, v.discard[v.discard.length - 1]))) locks++;
        const can = S.legalMoves(v);
        if (can.length && pick() < 0.92) {
          const id = can[Math.floor(pick() * can.length)];
          act = { type: 'play', card: id, colour: S.COLOURS[Math.floor(pick() * 4)] };
          if (st.house.sevenZero) act.swapWith = (me + 1) % st.seats;
        } else act = (st.pending > 0 || !st.drew) ? { type: 'draw' } : { type: 'pass' };
      }
      const out = S.applyAction(st, me, act);
      if (out.error) { errs[out.error] = (errs[out.error] || 0) + 1; broke++; break; }
      st = out.state;
    }
    if (steps > worst) worst = steps;
    if (st.phase === 'over') finished++;
  }
  return { finished, broke, worst, conservedAll, errs, locks, piles };
}
{
  const a = thousand(false);
  ok('a thousand rounds under the house rules run end to end with nothing refused', a.broke === 0, JSON.stringify(a.errs));
  ok('every one of them reached a winner', a.finished === 1000, a.finished + '/1000, longest ' + a.worst + ' actions');
  ok('108 cards are still 108 at every step of all of them', a.conservedAll);
  ok('the lock actually bit in those thousand rounds, and the piles actually formed',
    a.locks > 100 && a.piles > 100, 'locks=' + a.locks + ' piles=' + a.piles);

  const b = thousand(true);
  ok('a thousand rounds with the eased switch on run just as cleanly', b.broke === 0, JSON.stringify(b.errs));
  ok('and all of those reach a winner too', b.finished === 1000, b.finished + '/1000, longest ' + b.worst + ' actions');
  ok('and lose no card either', b.conservedAll);
  ok('the two rule sets really are different games', a.worst !== b.worst || a.piles !== b.piles,
    'a=' + a.worst + '/' + a.piles + ' b=' + b.worst + '/' + b.piles);
}

/* ---------- ١٦- الجولة التالية ---------------------------------------- */
{
  const g = rig(3, [[num(RED, 5)], [num(BLUE, 1), WILD], [SKIP(GREEN)]], num(RED, 9), 'red');
  const r = S.applyAction(g, 0, { type: 'play', card: num(RED, 5) });
  const n = S.nextRound(r.state);
  ok('the next round deals again and keeps the score',
    !n.error && n.state.round === 2 && n.state.scores[0] === r.state.scores[0], n.error);
  eq('the next round starts one seat along', n.state.turn === 1 || n.state.phase === 'colour', true);
  ok('the next round is a whole deck again', conserved(n.state));
  ok('and carries no pile over from the round before',
    n.state.pending === 0 && n.state.pendingKind === null);
  eq('a round still running cannot be skipped', S.nextRound(g).error, 'roundNotOver');
  eq('an action into a finished round is refused',
    S.applyAction(r.state, 1, { type: 'draw' }).error, 'roundOver');
}

console.log(bad ? '\n' + bad + ' FAILED of ' + ran : '\nALL PASS — ' + ran + ' checks');
process.exit(bad ? 1 : 0);
