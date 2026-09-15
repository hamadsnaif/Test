<script>
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Original Nokia Bounce (Series 40, 2002) - levels 1 to 3.
  // 12px tiles, 128x128 screen (96px play area + 32px HUD), 25 ticks/s.
  // Physics, collision rules and tile behaviour are translated from the
  // original game; graphics come from its sprite sheet.
  // ------------------------------------------------------------------

  const SHEET_B64 = '__SHEET__';
  const SPLASH_B64 = '__SPLASH__';
  const LEVELS = __LEVELS__;

  const T = 12, SW = 128, GA_H = 96;
  const BG = '#b0e0f0', WATER = '#1060b0', HUD_BG = '#0853aa', WHITE = '#fffffe', BONUS = '#ff9213';
  const NORMAL = 0, DEAD = 1, POPPED = 2;
  const LEFT = 1, RIGHT = 2, UP = 8;
  const TICK_MS = 40;

  const SMALL_MASK = [
    '....####....', '..########..', '.##########.', '.##########.',
    '############', '############', '############', '############',
    '.##########.', '.##########.', '..########..', '....####....'
  ].map(r => r.split('').map(ch => ch === '#' ? 1 : 0));
  const LARGE_MASK = [
    '.....######.....', '...##########...', '..############..', '.##############.',
    '.##############.', '################', '################', '################',
    '################', '################', '################', '.##############.',
    '.##############.', '..############..', '...##########...', '.....######.....'
  ].map(r => r.split('').map(ch => ch === '#' ? 1 : 0));
  const TRI = [];
  for (let j = 0; j < 12; j++) { TRI.push([]); for (let i = 0; i < 12; i++) TRI[j].push(i >= 11 - j ? 1 : 0); }

  const THIN_V = new Set([3, 5, 9, 13, 14, 17, 18, 21, 22, 43, 45]);
  const THIN_H = new Set([4, 6, 15, 16, 19, 20, 23, 24, 44, 46]);

  // 5x7 bitmap font (column bytes, bit 0 = top row)
  const FONT_SRC = {
    '0': '3E5149453E', '1': '00427F4000', '2': '4261514946', '3': '2141454B31', '4': '1814127F10',
    '5': '2745454539', '6': '3C4A494930', '7': '0171090503', '8': '3649494936', '9': '064949291E',
    A: '7E1111117E', B: '7F49494936', C: '3E41414122', D: '7F4141221C', E: '7F49494941', F: '7F09090901',
    G: '3E4149497A', H: '7F0808087F', I: '00417F4100', J: '2040413F01', K: '7F08142241', L: '7F40404040',
    M: '7F020C027F', N: '7F0408107F', O: '3E4141413E', P: '7F09090906', Q: '3E4151215E', R: '7F09192946',
    S: '4649494931', T: '01017F0101', U: '3F4040403F', V: '1F2040201F', W: '3F4038403F', X: '6314081463',
    Y: '0708700807', Z: '6151494543',
    a: '2054545478', b: '7F48444438', c: '3844444420', d: '384444487F', e: '3854545418', f: '087E090102',
    g: '0C5252523E', h: '7F08040478', i: '00447D4000', j: '2040443D00', k: '7F10284400', l: '00417F4000',
    m: '7C04180478', n: '7C08040478', o: '3844444438', p: '7C14141408', q: '081414187C', r: '7C08040408',
    s: '4854545420', t: '043F444020', u: '3C4040207C', v: '1C2040201C', w: '3C4030403C', x: '4428102844',
    y: '0C5050503C', z: '4464544C44',
    '!': '00005F0000', '.': '0060600000', ':': '0036360000', '-': '0808080808', ' ': '0000000000',
    '?': '0201510906', "'": '0005030000', ',': '0050300000'
  };
  const FONT = {};
  for (const k in FONT_SRC) FONT[k] = [0, 1, 2, 3, 4].map(i => parseInt(FONT_SRC[k].substr(i * 2, 2), 16));

  // ------------------------------------------------------------------
  // Level state
  // ------------------------------------------------------------------
  let levelNum = 1, ROWS = 0, COLS = 0, LEVEL_W = 0;
  let map = [];
  let exit = { col: 0, row: 0, offset: 0, open: false, opening: false };
  let totalRings = 0;
  let movers = []; // moving spikes: {c0,r0,c1,r1,dx,dy,ox,oy}
  let startCol = 0, startRow = 0, startSize = 12;

  function loadLevel(n) {
    const L = LEVELS[n - 1];
    ROWS = L.h; COLS = L.w; LEVEL_W = COLS * T;
    map = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(parseInt(L.hex.substr((r * COLS + c) * 2, 2), 16));
      map.push(row);
    }
    startCol = L.start[0]; startRow = L.start[1]; startSize = L.big ? 16 : 12;
    totalRings = 0;
    exit = { col: 0, row: 0, offset: 0, open: false, opening: false };
    movers = [];
    const seen = new Set();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const v = map[r][c] & 63;
      if (v === 13 || v === 15 || v === 21 || v === 23) totalRings++;
      if (v === 9 && (map[r - 1] ? (map[r - 1][c] & 63) : 0) !== 9 && (map[r][c - 1] & 63) !== 9) { exit.col = c; exit.row = r; }
      if (v === 10 && !seen.has(r * COLS + c)) {
        let c1 = c; while (c1 < COLS && (map[r][c1] & 63) === 10) c1++;
        let r1 = r;
        outer: while (r1 < ROWS) { for (let k = c; k < c1; k++) if ((map[r1][k] & 63) !== 10) break outer; r1++; }
        for (let rr = r; rr < r1; rr++) for (let cc = c; cc < c1; cc++) seen.add(rr * COLS + cc);
        const w = c1 - c, h = r1 - r;
        movers.push({ c0: c, r0: r, c1: c1, r1: r1, dx: w > 2 ? 2 : 0, dy: h > 2 ? 2 : 0, ox: 0, oy: 0 });
      }
    }
  }

  // ------------------------------------------------------------------
  // Graphics
  // ------------------------------------------------------------------
  const screen = document.createElement('canvas');
  screen.width = SW; screen.height = SW;
  const g = screen.getContext('2d');
  const view = document.getElementById('game');
  const vctx = view.getContext('2d');

  const IMG = {};
  let UI_LIFE, UI_RING, EXIT_IMG, SPIKE_IMG, SPLASH, SPLASH_BG = '#a0f0f8';

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function extract(sheet, cx, cy, bg) {
    const c = mk(T, T), x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, T, T); }
    x.drawImage(sheet, cx * T, cy * T, T, T, 0, 0, T, T);
    return c;
  }
  // Nokia DirectGraphics manipulations: 0 flipH, 1 flipV, 2 both, 3 rot 90 ccw, 4 rot 180, 5 rot 270 ccw
  function manip(src, mode) {
    const s = src.width, c = mk(s, s), x = c.getContext('2d');
    if (mode === 0) { x.translate(s, 0); x.scale(-1, 1); }
    else if (mode === 1) { x.translate(0, s); x.scale(1, -1); }
    else if (mode === 2) { x.translate(s, s); x.scale(-1, -1); }
    else if (mode === 3) { x.translate(0, s); x.rotate(-Math.PI / 2); }
    else if (mode === 4) { x.translate(s, s); x.rotate(Math.PI); }
    else if (mode === 5) { x.translate(s, 0); x.rotate(Math.PI / 2); }
    x.drawImage(src, 0, 0);
    return c;
  }
  function createExitImage(tile) {
    const c = mk(24, 48), x = c.getContext('2d');
    x.fillStyle = BG; x.fillRect(0, 0, 24, 48);
    x.fillStyle = '#fca19e'; x.fillRect(4, 0, 16, 48);
    x.fillStyle = '#e33a3f'; x.fillRect(6, 0, 10, 48);
    x.fillStyle = '#c2828e'; x.fillRect(10, 0, 4, 48);
    x.drawImage(tile, 0, 0);
    x.drawImage(manip(tile, 0), 12, 0);
    x.drawImage(manip(tile, 1), 0, 12);
    x.drawImage(manip(tile, 2), 12, 12);
    return c;
  }
  function createLargeBallImage(q) {
    const c = mk(16, 16), x = c.getContext('2d');
    x.drawImage(q, -4, -4);
    x.drawImage(manip(q, 0), 8, -4);
    x.drawImage(manip(q, 1), -4, 8);
    x.drawImage(manip(q, 4), 8, 8);
    return c;
  }
  function createSpikeImage(q) {
    const c = mk(24, 24), x = c.getContext('2d');
    x.drawImage(q, 0, 0);
    x.drawImage(manip(q, 0), 12, 0);
    x.drawImage(manip(q, 4), 12, 12);
    x.drawImage(manip(q, 1), 0, 12);
    return c;
  }
  function loadImage(b64) {
    return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + b64; });
  }
  async function loadGraphics() {
    const sh = await loadImage(SHEET_B64);
    IMG[0] = extract(sh, 1, 0);                 // red bricks
    IMG[1] = extract(sh, 1, 2);                 // blue rubber bricks
    IMG[2] = extract(sh, 0, 3, BG);             // spikes up
    IMG[3] = manip(IMG[2], 1); IMG[4] = manip(IMG[2], 3); IMG[5] = manip(IMG[2], 5);
    IMG[6] = extract(sh, 0, 3, WATER);          // wet spikes
    IMG[7] = manip(IMG[6], 1); IMG[8] = manip(IMG[6], 3); IMG[9] = manip(IMG[6], 5);
    IMG[10] = extract(sh, 0, 4);                // respawn gem
    IMG[11] = extract(sh, 3, 4);                // respawn indicator
    // hoops: large/small, active/inactive, horizontal quarters then vertical
    IMG[14] = extract(sh, 0, 5); IMG[13] = manip(IMG[14], 1); IMG[15] = manip(IMG[13], 0); IMG[16] = manip(IMG[14], 0);
    IMG[18] = extract(sh, 1, 5); IMG[17] = manip(IMG[18], 1); IMG[19] = manip(IMG[17], 0); IMG[20] = manip(IMG[18], 0);
    IMG[22] = extract(sh, 2, 5); IMG[21] = manip(IMG[22], 1); IMG[23] = manip(IMG[21], 0); IMG[24] = manip(IMG[22], 0);
    IMG[26] = extract(sh, 3, 5); IMG[25] = manip(IMG[26], 1); IMG[27] = manip(IMG[25], 0); IMG[28] = manip(IMG[26], 0);
    IMG[29] = manip(IMG[14], 5); IMG[30] = manip(IMG[29], 1); IMG[31] = manip(IMG[29], 0); IMG[32] = manip(IMG[30], 0);
    IMG[33] = manip(IMG[18], 5); IMG[34] = manip(IMG[33], 1); IMG[35] = manip(IMG[33], 0); IMG[36] = manip(IMG[34], 0);
    IMG[37] = manip(IMG[22], 5); IMG[38] = manip(IMG[37], 1); IMG[39] = manip(IMG[37], 0); IMG[40] = manip(IMG[38], 0);
    IMG[41] = manip(IMG[26], 5); IMG[42] = manip(IMG[41], 1); IMG[43] = manip(IMG[41], 0); IMG[44] = manip(IMG[42], 0);
    IMG[45] = extract(sh, 3, 3);                // extra life
    IMG[46] = extract(sh, 1, 3);                // moving spike quarter
    IMG[47] = extract(sh, 2, 0);                // small ball
    IMG[48] = extract(sh, 0, 1);                // popped ball
    IMG[49] = createLargeBallImage(extract(sh, 3, 0));
    IMG[50] = extract(sh, 3, 1);                // deflator
    IMG[51] = extract(sh, 2, 4);                // inflator
    IMG[52] = extract(sh, 3, 2);                // gravity
    IMG[53] = extract(sh, 1, 1);                // speed
    IMG[54] = extract(sh, 2, 2);                // jump
    IMG[55] = extract(sh, 0, 0, BG);            // triangle bottom-right
    IMG[56] = manip(IMG[55], 3); IMG[57] = manip(IMG[55], 4); IMG[58] = manip(IMG[55], 5);
    IMG[59] = extract(sh, 0, 0, WATER);
    IMG[60] = manip(IMG[59], 3); IMG[61] = manip(IMG[59], 4); IMG[62] = manip(IMG[59], 5);
    IMG[63] = extract(sh, 0, 2);                // rubber triangle
    IMG[64] = manip(IMG[63], 3); IMG[65] = manip(IMG[63], 4); IMG[66] = manip(IMG[63], 5);
    for (const base of [50, 51, 52, 54]) { IMG[base + 'r270'] = manip(IMG[base], 5); IMG[base + 'r180'] = manip(IMG[base], 4); IMG[base + 'r90'] = manip(IMG[base], 3); }
    UI_LIFE = extract(sh, 2, 1);
    UI_RING = extract(sh, 1, 4);
    EXIT_IMG = createExitImage(extract(sh, 2, 3));
    SPIKE_IMG = createSpikeImage(IMG[46]);
    SPLASH = await loadImage(SPLASH_B64);
    const sc = mk(1, 1).getContext('2d');
    sc.drawImage(SPLASH, -2, -40);
    const p = sc.getImageData(0, 0, 1, 1).data;
    SPLASH_BG = 'rgb(' + p[0] + ',' + p[1] + ',' + p[2] + ')';
  }

  // hoop halves: back drawn with tiles, front drawn over the ball
  const HOOP_BACK = { 13: 35, 14: 36, 15: 17, 16: 19, 17: 43, 18: 44, 19: 25, 20: 27, 21: 31, 22: 32, 23: 13, 24: 15, 25: 39, 26: 40, 27: 21, 28: 23 };
  const HOOP_FRONT = { 13: 33, 14: 34, 15: 18, 16: 20, 17: 41, 18: 42, 19: 26, 20: 28, 21: 29, 22: 30, 23: 14, 24: 16, 25: 37, 26: 38, 27: 22, 28: 24 };
  function tileImage(id, wet) {
    switch (id) {
      case 1: return IMG[0]; case 2: return IMG[1];
      case 3: return wet ? IMG[6] : IMG[2]; case 4: return wet ? IMG[9] : IMG[5];
      case 5: return wet ? IMG[7] : IMG[3]; case 6: return wet ? IMG[8] : IMG[4];
      case 7: return IMG[10]; case 8: return IMG[11]; case 29: return IMG[45];
      case 30: return wet ? IMG[61] : IMG[57]; case 31: return wet ? IMG[60] : IMG[56];
      case 32: return wet ? IMG[59] : IMG[55]; case 33: return wet ? IMG[62] : IMG[58];
      case 34: return IMG[65]; case 35: return IMG[64]; case 36: return IMG[63]; case 37: return IMG[66];
      case 38: return IMG[53];
      case 39: return IMG[50]; case 40: return IMG['50r270']; case 41: return IMG['50r180']; case 42: return IMG['50r90'];
      case 43: return IMG[51]; case 44: return IMG['51r270']; case 45: return IMG['51r180']; case 46: return IMG['51r90'];
      case 47: return IMG[52]; case 48: return IMG['52r270']; case 49: return IMG['52r180']; case 50: return IMG['52r90'];
      case 51: return IMG[54]; case 52: return IMG['54r270']; case 53: return IMG['54r180']; case 54: return IMG['54r90'];
    }
    return null;
  }

  function drawText(str, x, y, color) {
    g.fillStyle = color;
    for (const ch of str) {
      const gl = FONT[ch] || FONT['?'];
      for (let col = 0; col < 5; col++) {
        const bits = gl[col];
        for (let row = 0; row < 7; row++) if (bits & (1 << row)) g.fillRect(x + col, y + row, 1, 1);
      }
      x += 6;
    }
  }
  function textWidth(str) { return str.length * 6 - 1; }
  function centerText(str, y, color) { drawText(str, Math.floor((SW - textWidth(str)) / 2), y, color); }

  // ------------------------------------------------------------------
  // Sound (decoded from the original ringtone files: up, pickup, pop)
  // ------------------------------------------------------------------
  const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function nf(name, scale) { return 261.63 * Math.pow(2, scale) * Math.pow(2, NOTE_IDX[name] / 12); }
  const Q = 60 / 125;
  const SND_HOOP = [[nf('C', 2), Q / 4], [nf('E', 1), Q / 4], [nf('G', 1), Q / 4], [nf('C', 2), Q / 4]];
  const SND_PICKUP = [[nf('C', 2), Q / 2], [nf('G', 1), Q / 4], [nf('C', 2), Q / 2]];
  const SND_POP = [[nf('G', 2), Q / 8], [nf('B', 2), Q / 8], [nf('C', 1), Q / 4]];
  let audio = null;
  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { /* no audio */ }
  }
  function play(seq) {
    try {
      if (!audio || audio.state !== 'running') return;
      let t = audio.currentTime + 0.01;
      for (const [freq, dur] of seq) {
        const o = audio.createOscillator(), gn = audio.createGain();
        o.type = 'square'; o.frequency.value = freq;
        gn.gain.setValueAtTime(0.04, t);
        gn.gain.setValueAtTime(0.04, t + dur * 0.8);
        gn.gain.linearRampToValueAtTime(0.0001, t + dur * 0.9);
        o.connect(gn); gn.connect(audio.destination);
        o.start(t); o.stop(t + dur);
        t += dur;
      }
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------
  // Game state
  // ------------------------------------------------------------------
  const ball = {
    x: 0, y: 0, vx: 0, vy: 0, dir: 0, size: 12, half: 6, grounded: false, state: NORMAL, pop: 0,
    jumpOffset: 0, speedBonus: 0, gravBonus: 0, jumpBonus: 0, rubber: false, ramp: false, slide: 0,
    respawnC: 0, respawnR: 0, respawnSize: 12
  };
  let lives = 3, score = 0, rings = 0, levelCntr = 0, camX = 0, camRow = 0;
  let mode = 'splash'; // splash | menu | play | pause | complete | over | won
  let menuSel = 0, pauseSel = 0, hiScore = 0;
  let jumpBuffer = 0;                 // remembers a jump tapped just before landing
  let JUMP_BUFFER_TICKS = 6;          // about 240 ms
  let modeSince = 0;
  let leaveLevel = false;
  const held = { left: false, right: false, up: false };

  // The chassis reads the mode from the body: the RUN lamp, the pause key's
  // glyph and its engraved caption all follow it in CSS.
  function setMode(m) {
    document.body.dataset.mode = m;
    document.body.classList.toggle('paused', m === 'pause');
    mode = m; modeSince = performance.now();
  }
  function heldDir() { return (held.left ? LEFT : 0) | (held.right ? RIGHT : 0) | (held.up ? UP : 0); }

  // Every input surface keeps its own state, so releasing one never cancels
  // another that is still held (left thumb steering while the right taps jump).
  const sources = {
    key: { left: false, right: false, up: false },
    pad: { left: false, right: false, up: false },
    stick: { left: false, right: false, up: false },
    jump: { left: false, right: false, up: false }
  };
  function refreshKeys() {
    const wasUp = held.up;
    for (const k of ['left', 'right', 'up']) held[k] = sources.key[k] || sources.pad[k] || sources.stick[k] || sources.jump[k];
    if (held.up && !wasUp) jumpBuffer = JUMP_BUFFER_TICKS;
    ball.dir = heldDir();
  }
  function setFrom(source, k, on) { sources[source][k] = on; refreshKeys(); }
  function clearKeys() {
    for (const s of Object.keys(sources)) for (const k of ['left', 'right', 'up']) sources[s][k] = false;
    refreshKeys();
  }

  // ------------------------------------------------------------------
  // Saved game and high score (browser storage, like the phone's memory)
  // ------------------------------------------------------------------
  function loadHiScore() { try { hiScore = parseInt(localStorage.getItem('bounce_hiscore') || '0', 10) || 0; } catch (e) { hiScore = 0; } }
  function updateHiScore() { if (score > hiScore) { hiScore = score; try { localStorage.setItem('bounce_hiscore', String(hiScore)); } catch (e) { /* ignore */ } } }
  function hasSave() { try { return !!localStorage.getItem('bounce_save'); } catch (e) { return false; } }
  function saveGame() {
    try {
      const hex = map.map(row => row.map(v => (v & 0xff).toString(16).padStart(2, '0')).join('')).join('');
      localStorage.setItem('bounce_save', JSON.stringify({
        level: levelNum, score, lives, rings, respawnC: ball.respawnC, respawnR: ball.respawnR, respawnSize: ball.respawnSize,
        exitOffset: exit.offset, exitOpen: exit.open, hex
      }));
    } catch (e) { /* storage unavailable */ }
  }
  function clearSave() { try { localStorage.removeItem('bounce_save'); } catch (e) { /* ignore */ } }
  function continueGame() {
    let sv = null;
    try { sv = JSON.parse(localStorage.getItem('bounce_save')); } catch (e) { sv = null; }
    if (!sv || !LEVELS[sv.level - 1]) { newGame(); return; }
    startLevel(sv.level);
    score = sv.score; lives = sv.lives; rings = sv.rings;
    if (sv.hex && sv.hex.length === ROWS * COLS * 2) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) map[r][c] = parseInt(sv.hex.substr((r * COLS + c) * 2, 2), 16);
    }
    exit.offset = sv.exitOffset || 0; exit.open = !!sv.exitOpen; exit.opening = exit.open;
    ball.respawnC = sv.respawnC; ball.respawnR = sv.respawnR; ball.respawnSize = sv.respawnSize || 12;
    respawn();
    levelCntr = 60;
  }
  // The stick is the control this game is played with: one thumb steers and
  // jumps, and there is nothing small to hit. The number pad is the
  // alternative for anyone who wants the keys.
  let joystick = true;
  try {
    const saved = localStorage.getItem('bounce_controls');
    if (saved) joystick = saved === 'stick';
  } catch (e) { /* storage off */ }
  function applyControls() { document.body.classList.toggle('joystick', joystick); }
  function toggleControls() {
    joystick = !joystick;
    try { localStorage.setItem('bounce_controls', joystick ? 'stick' : 'pad'); } catch (e) { /* storage off */ }
    applyControls();
    clearKeys();
    requestAnimationFrame(resize);
  }
  function menuItems() {
    const items = ['New game', 'Continue', 'High score ' + String(hiScore).padStart(8, '0')];
    if (isTouch) items.push('Controls: ' + (joystick ? 'Stick' : 'Keys'));
    return items;
  }
  function pauseItems() {
    const items = ['Continue'];
    if (isTouch) items.push('Controls: ' + (joystick ? 'Stick' : 'Keys'));
    items.push('Main menu');
    return items;
  }
  function openMenu() { loadHiScore(); menuSel = hasSave() ? 1 : 0; setMode('menu'); }
  function menuSelect() {
    if (menuSel === 0) newGame();
    else if (menuSel === 1) { if (hasSave()) continueGame(); }
    else if (menuSel === 3) toggleControls();
  }
  function pauseSelect() {
    const items = pauseItems();
    const pick = items[pauseSel];
    if (pick === 'Continue') setMode('play');
    else if (pick === 'Main menu') { saveGame(); openMenu(); }
    else toggleControls();
  }

  function startLevel(n) {
    levelNum = n;
    loadLevel(n);
    rings = 0; levelCntr = 120; leaveLevel = false;
    ball.respawnC = startCol; ball.respawnR = startRow; ball.respawnSize = startSize;
    respawn();
    camRow = Math.trunc(startRow / 7) * 7;
    setMode('play');
    saveGame();
  }
  function newGame() { lives = 3; score = 0; startLevel(1); }
  function setSize(sz) {
    ball.size = sz; ball.half = sz >> 1;
  }
  function respawn() {
    setSize(ball.respawnSize);
    ball.x = ball.respawnC * T + ball.half; ball.y = ball.respawnR * T + ball.half;
    ball.vx = 0; ball.vy = 0; ball.grounded = false; ball.state = NORMAL; ball.pop = 0;
    ball.jumpOffset = 0; ball.speedBonus = 0; ball.gravBonus = 0; ball.jumpBonus = 0; ball.rubber = false; ball.ramp = false; ball.slide = 0;
    jumpBuffer = 0;
    ball.dir = heldDir();
    camRow = Math.trunc(ball.respawnR / 7) * 7;
  }

  // ------------------------------------------------------------------
  // Collision (translated from the original Ball class)
  // ------------------------------------------------------------------
  let gX = 0, gY = 0;
  function rectCollide(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
    return !(ax0 > bx1 || ay0 > by1 || bx0 > ax1 || by0 > ay1);
  }
  function ballRect(bx0, by0, bx1, by1) { return rectCollide(gX, gY, gX + ball.size, gY + ball.size, bx0, by0, bx1, by1); }
  function thinCollide(r, c, id) {
    let x0 = c * T, y0 = r * T, x1 = x0 + T, y1 = y0 + T;
    if (THIN_V.has(id)) { x0 += 4; x1 -= 4; } else if (THIN_H.has(id)) { y0 += 4; y1 -= 4; }
    return ballRect(x0, y0, x1, y1);
  }
  function edgeCollide(r, c, id) {
    let x0 = c * T, y0 = r * T, x1 = x0 + T, y1 = y0 + T;
    switch (id) {
      case 15: case 19: case 23: case 27: y0 += 6; y1 -= 6; x1 -= 11; break;
      case 16: case 20: case 24: case 28: y0 += 6; y1 -= 6; x0 += 11; break;
      case 13: case 17: x0 += 6; x1 -= 6; y1 -= 11; break;
      case 21: case 25: y1 = y0; y0 -= 1; x0 += 6; x1 -= 6; break;
      case 14: case 18: case 22: case 26: x0 += 6; x1 -= 6; y0 += 11; break;
      default: return false;
    }
    return ballRect(x0, y0, x1, y1);
  }
  function overlapRange(d) { return d >= 0 ? [d, T] : [0, Math.min(T, ball.size + d)]; }
  function squareCollide(r, c) {
    const dx = gX - c * T, dy = gY - r * T;
    const [sx0, sx1] = overlapRange(dx), [sy0, sy1] = overlapRange(dy);
    const M = ball.size === 16 ? LARGE_MASK : SMALL_MASK;
    for (let sx = sx0; sx < sx1; sx++)
      for (let sy = sy0; sy < sy1; sy++)
        if (M[sy - dy][sx - dx]) return true;
    return false;
  }
  function triangleCollide(r, c, id) {
    const dx = gX - c * T, dy = gY - r * T;
    let ox = 0, oy = 0;
    if (id === 30 || id === 34) { ox = 11; oy = 11; }
    else if (id === 31 || id === 35) { oy = 11; }
    else if (id === 33 || id === 37) { ox = 11; }
    const [sx0, sx1] = overlapRange(dx), [sy0, sy1] = overlapRange(dy);
    const M = ball.size === 16 ? LARGE_MASK : SMALL_MASK;
    for (let i = sx0; i < sx1; i++)
      for (let j = sy0; j < sy1; j++)
        if (TRI[Math.abs(j - oy)][Math.abs(i - ox)] && M[j - dy][i - dx]) {
          if (!ball.grounded) redirectBall(id);
          return true;
        }
    return false;
  }
  function redirectBall(id) {
    const b = ball, ox = b.vx;
    switch (id) {
      case 30: if (b.vx >= b.vy) b.vx = -(b.vy >> 1); b.vy = -ox; break;
      case 31: if (b.vx <= -b.vy) b.vx = b.vy >> 1; b.vy = ox; break;
      case 32: if (b.vx <= b.vy) b.vx = -(b.vy >> 1); b.vy = -ox; break;
      case 33: if (-b.vx <= b.vy) b.vx = b.vy >> 1; b.vy = ox; break;
      case 34: if (b.vx >= b.vy) b.vx = -b.vy; b.vy = -ox; break;
      case 35: if (b.vx <= -b.vy) b.vx = b.vy; b.vy = ox; break;
      case 36: if (b.vx <= b.vy) b.vx = -b.vy; b.vy = -ox; break;
      case 37: if (-b.vx <= b.vy) b.vx = b.vy; b.vy = ox; break;
    }
  }
  function popBall() {
    ball.pop = 5; ball.state = POPPED; lives--; ball.speedBonus = 0; ball.gravBonus = 0; ball.jumpBonus = 0;
    play(SND_POP);
  }
  function addRing() { score += 500; rings++; }
  function setTiles(r, c, id1, r2, c2, id2, w) { map[r][c] = id1 | w; map[r2][c2] = id2 | w; }
  function enlargeBall() {
    setSize(16);
    const b = ball;
    for (let k = 2; k < 60; k++) {
      if (collisionDetection(b.x, b.y - k)) { b.y -= k; return; }
      if (collisionDetection(b.x - k, b.y - k)) { b.x -= k; b.y -= k; return; }
      if (collisionDetection(b.x + k, b.y - k)) { b.x += k; b.y -= k; return; }
      if (collisionDetection(b.x, b.y + k)) { b.y += k; return; }
      if (collisionDetection(b.x - k, b.y + k)) { b.x -= k; b.y += k; return; }
      if (collisionDetection(b.x + k, b.y + k)) { b.x += k; b.y += k; return; }
    }
  }
  function shrinkBall() {
    setSize(12);
    if (collisionDetection(ball.x, ball.y + 2)) ball.y += 2;
    else if (collisionDetection(ball.x, ball.y - 2)) ball.y -= 2;
  }

  function testTile(r, c, ok) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (ball.state === POPPED) return false;
    const raw = map[r][c], w = raw & 64, id = raw & 63;
    const large = ball.size === 16;
    switch (id) {
      case 1:
        if (squareCollide(r, c)) ok = false; else ball.ramp = true;
        break;
      case 2:
        if (squareCollide(r, c)) { ball.rubber = true; ok = false; } else ball.ramp = true;
        break;
      case 3: case 4: case 5: case 6:
        if (thinCollide(r, c, id)) { ok = false; popBall(); }
        break;
      case 7:
        score += 200;
        if ((map[ball.respawnR][ball.respawnC] & 63) === 8) map[ball.respawnR][ball.respawnC] &= 64;
        ball.respawnC = c; ball.respawnR = r; ball.respawnSize = ball.size;
        map[r][c] = 8 | w;
        play(SND_PICKUP);
        saveGame();
        break;
      case 9:
        if (thinCollide(r, c, id)) {
          if (exit.open) { leaveLevel = true; play(SND_PICKUP); }
          else ok = false;
        }
        break;
      case 10: {
        for (const m of movers) {
          if (m.c0 <= c && c < m.c1 && m.r0 <= r && r < m.r1) {
            const sx = m.c0 * T + m.ox, sy = m.r0 * T + m.oy;
            if (ballRect(sx, sy, sx + 24, sy + 24)) { ok = false; popBall(); }
            break;
          }
        }
        break;
      }
      case 13:
        if (thinCollide(r, c, id)) {
          if (large) ok = false;
          else if (edgeCollide(r, c, id)) ok = false;
          else { addRing(); setTiles(r, c, 17, r + 1, c, 18, w); play(SND_HOOP); }
        }
        break;
      case 14:
        if (thinCollide(r, c, id)) {
          if (large) ok = false;
          else { addRing(); setTiles(r, c, 18, r - 1, c, 17, w); play(SND_HOOP); }
        }
        break;
      case 15:
        if (thinCollide(r, c, id)) {
          if (large) ok = false;
          else { if (edgeCollide(r, c, id)) ok = false; addRing(); setTiles(r, c, 19, r, c + 1, 20, w); play(SND_HOOP); }
        }
        break;
      case 16:
        if (thinCollide(r, c, id)) {
          if (large) ok = false;
          else { if (edgeCollide(r, c, id)) ok = false; addRing(); setTiles(r, c, 20, r, c - 1, 19, w); play(SND_HOOP); }
        }
        break;
      case 17: case 19: case 20:
        if (thinCollide(r, c, id)) { if (large) ok = false; else if (edgeCollide(r, c, id)) ok = false; }
        break;
      case 18:
        if (thinCollide(r, c, id) && large) ok = false;
        break;
      case 21:
        if (thinCollide(r, c, id)) {
          if (edgeCollide(r, c, id)) ok = false;
          else { addRing(); setTiles(r, c, 25, r + 1, c, 26, w); play(SND_HOOP); }
        }
        break;
      case 22:
        if (thinCollide(r, c, id)) { addRing(); setTiles(r, c, 26, r - 1, c, 25, w); play(SND_HOOP); }
        break;
      case 23:
        if (thinCollide(r, c, id)) { if (edgeCollide(r, c, id)) ok = false; addRing(); setTiles(r, c, 27, r, c + 1, 28, w); play(SND_HOOP); }
        break;
      case 24:
        if (thinCollide(r, c, id)) { if (edgeCollide(r, c, id)) ok = false; addRing(); setTiles(r, c, 28, r, c - 1, 27, w); play(SND_HOOP); }
        break;
      case 25: case 27: case 28:
        if (edgeCollide(r, c, id)) ok = false;
        break;
      case 29:
        score += 1000;
        if (lives < 5) lives++;
        map[r][c] = w;
        play(SND_PICKUP);
        break;
      case 30: case 31: case 32: case 33:
        if (triangleCollide(r, c, id)) { ok = false; ball.ramp = true; }
        break;
      case 34: case 35: case 36: case 37:
        if (triangleCollide(r, c, id)) { ball.rubber = true; ok = false; ball.ramp = true; }
        break;
      case 38:
        ball.speedBonus = 300; play(SND_PICKUP); ok = false;
        break;
      case 39: case 40: case 41: case 42:
        ok = false;
        if (large) shrinkBall();
        break;
      case 43: case 44: case 45: case 46:
        if (thinCollide(r, c, id)) { ok = false; if (!large) enlargeBall(); }
        break;
      case 47: case 48: case 49: case 50:
        ball.gravBonus = 300; play(SND_PICKUP); ok = false;
        break;
      case 51: case 52: case 53: case 54:
        ball.jumpBonus = 300; play(SND_PICKUP); ok = false;
        break;
    }
    return ok;
  }
  function collisionDetection(x, y) {
    const h = ball.half;
    gX = x - h; gY = y - h;
    const c0 = Math.trunc((x - h) / T), c1 = Math.trunc((x - 1 + h) / T) + 1;
    const r0 = Math.trunc((y - h) / T), r1 = Math.trunc((y - 1 + h) / T) + 1;
    let ok = true;
    for (let c = c0; c < c1; c++) for (let r = r0; r < r1; r++) ok = testTile(r, c, ok);
    return ok;
  }

  // ------------------------------------------------------------------
  // Ball physics (translated from the original Ball.update)
  // Speeds are in tenths of a pixel per tick.
  // ------------------------------------------------------------------
  function tileAt(c, r) { return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? map[r][c] : 0; }
  function updateBall() {
    const b = ball;
    if (b.state === POPPED) { b.pop--; if (b.pop === 0) b.state = DEAD; return; }
    const large = b.size === 16;
    const tx = Math.trunc(b.x / T), ty = Math.trunc(b.y / T);
    const inWater = (tileAt(tx, ty) & 64) !== 0;
    let maxGrav, grav, inv = false;
    if (inWater) {
      if (large) { maxGrav = -30; grav = -2; if (b.grounded) b.vy = -10; }
      else { maxGrav = 42; grav = 6; }
    } else if (large) { maxGrav = 38; grav = 3; }
    else { maxGrav = 80; grav = 4; }
    if (b.gravBonus) {
      inv = true; maxGrav = -maxGrav; grav = -grav;
      b.gravBonus--;
      if (b.gravBonus === 0) { inv = false; b.grounded = false; maxGrav = -maxGrav; grav = -grav; }
    }
    if (b.jumpBonus) {
      if (-Math.abs(b.jumpOffset) > -80) b.jumpOffset = inv ? 80 : -80;
      b.jumpBonus--;
    }
    b.slide++; if (b.slide === 3) b.slide = 0;
    if (b.vy < -150) b.vy = -150; else if (b.vy > 150) b.vy = 150;
    if (b.vx < -150) b.vx = -150; else if (b.vx > 150) b.vx = 150;

    for (let i = 0; i < Math.trunc(Math.abs(b.vy) / 10); i++) {
      const s = b.vy === 0 ? 0 : (b.vy < 0 ? -1 : 1);
      if (collisionDetection(b.x, b.y + s)) {
        b.y += s; b.grounded = false;
        if (maxGrav === -30 && !(tileAt(tx, Math.trunc(b.y / T)) & 64)) {
          b.vy = b.vy >> 1;
          if (b.vy <= 10 && b.vy >= -10) b.vy = 0;
        }
      } else {
        if (b.ramp && b.vx < 10 && b.slide === 0) {
          if (collisionDetection(b.x + 1, b.y + s)) { b.x += 1; b.y += s; b.ramp = false; }
          else if (collisionDetection(b.x - 1, b.y + s)) { b.x -= 1; b.y += s; b.ramp = false; }
        }
        if (s > 0 || (inv && s < 0)) {
          b.vy = Math.trunc(-b.vy / 2);
          b.grounded = true;
          if (b.rubber && ((b.dir & UP) || jumpBuffer > 0)) { b.rubber = false; b.jumpOffset += inv ? 10 : -10; }
          else if (b.jumpBonus === 0) b.jumpOffset = 0;
          if (b.vy < 10 && b.vy > -10) b.vy = inv ? -10 : 10;
          break;
        } else if (s < 0 || (inv && s > 0)) {
          b.vy = inv ? -20 : ((-b.vy) >> 1);
        }
      }
    }
    if (inv) {
      if (grav === 2) { if (b.vy < maxGrav) { b.vy += grav; if (b.vy > maxGrav) b.vy = maxGrav; } }
      else if (!b.grounded && b.vy > maxGrav) { b.vy += grav; if (b.vy < maxGrav) b.vy = maxGrav; }
    } else {
      if (grav === -2) { if (b.vy > maxGrav) { b.vy += grav; if (b.vy < maxGrav) b.vy = maxGrav; } }
      else if (!b.grounded && b.vy < maxGrav) { b.vy += grav; if (b.vy > maxGrav) b.vy = maxGrav; }
    }

    let maxH = 50;
    if (b.speedBonus) { maxH = 100; b.speedBonus--; }
    if (b.dir & RIGHT) { if (b.vx < maxH) b.vx += 6; }
    else if (b.dir & LEFT) { if (b.vx > -maxH) b.vx -= 6; }
    else if (b.vx > 0) b.vx -= 4;
    else if (b.vx < 0) b.vx += 4;

    if (large && b.jumpBonus === 0) b.jumpOffset += inv ? 5 : -5;
    if (b.grounded && ((b.dir & UP) || jumpBuffer > 0)) { b.vy = (inv ? 67 : -67) + b.jumpOffset; b.grounded = false; jumpBuffer = 0; }

    const steps = Math.trunc(Math.abs(b.vx) / 10);
    for (let i = 0; i < steps; i++) {
      const s = b.vx === 0 ? 0 : (b.vx < 0 ? -1 : 1);
      if (collisionDetection(b.x + s, b.y)) b.x += s;
      else if (b.ramp) {
        b.ramp = false;
        const k = inv ? 1 : -1;
        if (collisionDetection(b.x + s, b.y + k)) { b.x += s; b.y += k; }
        else if (collisionDetection(b.x + s, b.y - k)) { b.x += s; b.y -= k; }
        else b.vx = -(b.vx >> 1);
      }
    }
  }
  function updateMovers() {
    for (const m of movers) {
      const rx = Math.max(0, (m.c1 - m.c0 - 2) * T), ry = Math.max(0, (m.r1 - m.r0 - 2) * T);
      m.ox += m.dx;
      if (m.ox < 0) m.ox = 0; else if (m.ox > rx) m.ox = rx;
      if (m.ox === 0 || m.ox === rx) m.dx = -m.dx;
      m.oy += m.dy;
      if (m.oy < 0) m.oy = 0; else if (m.oy > ry) m.oy = ry;
      if (m.oy === 0 || m.oy === ry) m.dy = -m.dy;
    }
  }

  function tick() {
    if (mode !== 'play') return;
    if (levelCntr > 0) levelCntr--;
    if (jumpBuffer > 0) jumpBuffer--;
    // vertical screen flip (7-tile pages, as in the original)
    if (ball.y - camRow * T < 0) camRow -= 7;
    else if (ball.y - camRow * T > 96) camRow += 7;
    if (camRow < 0) camRow = 0;
    updateBall();
    if (ball.state === DEAD) {
      if (lives < 0) { updateHiScore(); clearSave(); setMode('over'); return; }
      respawn();
    }
    updateMovers();
    if (rings === totalRings) exit.opening = true;
    if (exit.opening && !exit.open) {
      exit.offset += 4;
      if (exit.offset >= 24) { exit.offset = 24; exit.open = true; }
    }
    if (leaveLevel) {
      score += 5000;
      if (levelNum >= LEVELS.length) { updateHiScore(); clearSave(); setMode('won'); } else setMode('complete');
    }
    camX = Math.max(0, Math.min(LEVEL_W - SW, ball.x - SW / 2));
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function drawWorld(ctx, cx, cy, w, h, drawHud) {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
    const c0 = Math.max(0, Math.trunc(cx / T)), c1 = Math.min(COLS - 1, Math.trunc((cx + w - 1) / T));
    const r0 = Math.max(0, Math.trunc(cy / T)), r1 = Math.min(ROWS - 1, Math.trunc((cy + h - 1) / T));
    const front = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const raw = map[r][c], wet = (raw & 64) !== 0, id = raw & 63;
        const sx = c * T - cx, sy = r * T - cy;
        if (wet) { ctx.fillStyle = WATER; ctx.fillRect(sx, sy, T, T); }
        const im = tileImage(id, wet);
        if (im) ctx.drawImage(im, sx, sy);
        else if (HOOP_BACK[id] !== undefined) { ctx.drawImage(IMG[HOOP_BACK[id]], sx, sy); front.push([IMG[HOOP_FRONT[id]], sx, sy]); }
      }
    }
    const ex = exit.col * T - cx, ey = exit.row * T - cy;
    if (ex > -24 && ex < w && ey > -24 && ey < h) ctx.drawImage(EXIT_IMG, 0, exit.offset, 24, 24, ex, ey, 24, 24);
    for (const m of movers) {
      const sx = m.c0 * T + m.ox - cx, sy = m.r0 * T + m.oy - cy;
      if (sx > -24 && sx < w && sy > -24 && sy < h) ctx.drawImage(SPIKE_IMG, sx, sy);
    }
    if (ball.state === POPPED) ctx.drawImage(IMG[48], ball.x - 6 - cx, ball.y - 6 - cy);
    else if (ball.state === NORMAL) ctx.drawImage(ball.size === 16 ? IMG[49] : IMG[47], ball.x - ball.half - cx, ball.y - ball.half - cy);
    for (const [im, x, y] of front) ctx.drawImage(im, x, y);
  }
  function drawGame() {
    drawWorld(g, Math.trunc(camX), camRow * T, SW, GA_H);
    if (levelCntr > 0) drawText('Level ' + levelNum, 44, 85, WHITE);
    g.fillStyle = '#ffffff'; g.fillRect(0, GA_H, SW, 1);
    g.fillStyle = HUD_BG; g.fillRect(0, 97, SW, 31);
    for (let i = 0; i < lives; i++) g.drawImage(UI_LIFE, 5 + i * 11, 99);
    for (let i = 0; i < totalRings - rings; i++) g.drawImage(UI_RING, 5 + i * 8, 112);
    drawText(String(score).padStart(8, '0'), 64, 101, WHITE);
    const bonus = Math.max(ball.speedBonus, ball.gravBonus, ball.jumpBonus);
    if (bonus) { g.fillStyle = BONUS; g.fillRect(1, 128 - Math.trunc(3 * bonus / 30) - 5, 5, 128); }
  }
  function drawList(title, items, sel, disabled) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, SW, SW);
    g.fillStyle = HUD_BG; g.fillRect(0, 0, SW, 16);
    centerText(title, 5, WHITE);
    let y = 30;
    items.forEach((it, i) => {
      if (i === sel) { g.fillStyle = HUD_BG; g.fillRect(4, y - 4, SW - 8, 15); }
      const off = disabled && disabled.has(i);
      drawText(it, 12, y, i === sel ? WHITE : (off ? '#a0a8b8' : '#000000'));
      y += 20;
    });
  }
  function drawMenu() {
    drawList('Bounce', menuItems(), menuSel, hasSave() ? null : new Set([1]));
    centerText('4 6 move  2 select', 112, '#6a7280');
  }
  function drawPause() {
    drawList('Pause', pauseItems(), pauseSel, null);
    centerText('Level ' + levelNum + '  ' + String(score).padStart(8, '0'), 112, '#6a7280');
  }
  function drawSplash() {
    g.drawImage(SPLASH, 0, 0);
    g.fillStyle = SPLASH_BG; g.fillRect(0, 0, SW, 18);
    if (Math.floor(performance.now() / 500) % 2 === 0) centerText('Press a key', 112, '#000000');
  }
  function drawDialog(lines, prompt) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, SW, SW);
    let y = 22;
    for (const ln of lines) { centerText(ln, y, '#000000'); y += 12; }
    g.fillStyle = HUD_BG; g.fillRect(0, 108, SW, 20);
    centerText(prompt, 114, WHITE);
  }
  function draw() {
    const sc = String(score).padStart(8, '0');
    if (mode === 'splash') drawSplash();
    else if (mode === 'menu') drawMenu();
    else if (mode === 'pause') { drawGame(); drawPause(); }
    else if (mode === 'play') drawGame();
    else if (mode === 'complete') drawDialog(['Level ' + levelNum, 'completed!', '', 'Score', sc], 'Continue');
    else if (mode === 'won') drawDialog(['Congrats!', '', 'Level ' + levelNum, 'completed!', '', 'Score', sc], 'New game');
    else if (mode === 'over') drawDialog(['Game over', '', 'Score', sc], 'New game');
    vctx.imageSmoothingEnabled = false;
    vctx.drawImage(screen, 0, 0, view.width, view.height);
  }

  // ------------------------------------------------------------------
  // Sizing: integer scale in device pixels for crisp pixels
  // ------------------------------------------------------------------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const stage = document.getElementById('stage');
    const well = stage.parentElement;
    const unit = stage.closest('.unit');
    // Pass 1 - measure: body fills the viewport, the well swallows the free
    // space, the stage takes none. What the well reports is all we may use.
    // The wide-frame layout lays deck beside well, and there the body is
    // shrink-to-fit: without this it would measure its own emptiness.
    if (unit) { unit.style.height = '100%'; unit.style.width = '100%'; }
    well.style.flexGrow = '1';
    stage.style.width = stage.style.height = '0px';
    const aw = well.clientWidth, ah = well.clientHeight;
    let k = Math.floor((Math.min(aw, ah) - 22) * dpr / SW);   // 8 breathing room + the well's 7px each side
    if (k < 1) k = 1;
    view.width = view.height = SW * k;
    const css = SW * k / dpr;
    view.style.width = view.style.height = css + 'px';
    // Pass 2 - settle: the well hugs the square picture and the body hugs the
    // well, so no black bands are left above and below the game.
    stage.style.width = stage.style.height = css + 'px';
    well.style.flexGrow = '0';
    if (unit) { unit.style.height = 'auto'; unit.style.width = ''; }
    if (IMG[0]) draw();
    if (typeof restStick === 'function') restStick();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(hover: none)').matches;
  if (isTouch) document.body.classList.add('touch');
  if (navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches) document.body.classList.add('standalone');
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  function press() {
    if (mode === 'play' || performance.now() - modeSince < 400) return;
    if (mode === 'splash') openMenu();
    else if (mode === 'menu') menuSelect();
    else if (mode === 'pause') pauseSelect();
    else if (mode === 'complete') startLevel(levelNum + 1);
    else openMenu();
  }
  function moveSel(d) {
    if (mode === 'menu') { const n = menuItems().length; menuSel = (menuSel + d + n) % n; }
    else if (mode === 'pause') { const n = pauseItems().length; pauseSel = (pauseSel + d + n) % n; }
  }
  function togglePause() {
    if (mode === 'play') { pauseSel = 0; setMode('pause'); clearKeys(); }
    else if (mode === 'pause') setMode('play');
  }
  function tapAt(clientY) {
    const rect = view.getBoundingClientRect();
    const y = (clientY - rect.top) / rect.height * SW;
    if (mode === 'menu' || mode === 'pause') {
      const n = (mode === 'menu' ? menuItems() : pauseItems()).length;
      const i = Math.floor((y - 26) / 20);
      if (i >= 0 && i < n) { if (mode === 'menu') menuSel = i; else pauseSel = i; }
    }
    press();
  }
  function setKey(k, on) { setFrom('key', k, on); }
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', Digit4: 'left', Numpad4: 'left',
    ArrowRight: 'right', KeyD: 'right', Digit6: 'right', Numpad6: 'right',
    ArrowUp: 'up', KeyW: 'up', Space: 'up', Digit2: 'up', Numpad2: 'up', Digit5: 'up', Numpad5: 'up'
  };
  window.addEventListener('keydown', e => {
    unlockAudio();
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
    const k = KEYMAP[e.code];
    if (mode === 'menu' || mode === 'pause') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'Digit4' || e.code === 'Digit8' || e.code === 'Numpad4' || e.code === 'Numpad8') moveSel(-1);
      else if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Digit6' || e.code === 'Numpad6' || e.code === 'Numpad2' || e.code === 'Digit2') moveSel(1);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Digit5' || e.code === 'Numpad5') press();
      return;
    }
    if (k) { e.preventDefault(); if (!e.repeat) setKey(k, true); }
    if (mode !== 'play' && !e.repeat && (k || e.code === 'Enter')) press();
  });
  window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) setKey(k, false); });
  window.addEventListener('blur', clearKeys);

  // Leaving through the launcher's رجوع, or the swipe back gesture, destroys
  // this frame outright — and iOS may discard it while the app is in the
  // background. Without this the level is handed back as it was at the last
  // start or checkpoint, silently losing every ring picked up since, which is
  // the opposite of what the game's own hint promises. Exiting through the
  // pause menu already saves; this makes every other way out behave the same.
  // saveGame writes one synchronous localStorage entry, so it completes inside
  // the teardown, and the guard keeps half finished states out of the save.
  const persist = () => { if (mode === 'play' || mode === 'pause') saveGame(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearKeys(); persist(); } });
  window.addEventListener('pagehide', persist);


  // ------------------------------------------------------------------
  // The phone's own keys. Three of the Nokia keypad's keys are on the
  // chassis: 4 and 6 steer, 5 jumps (and confirms in the menus). A
  // diagonal jump is 4+5 or 6+5 held together, which the per-source merge
  // above already supports.
  //
  //   4 ←   5 ↑   6 →
  // ------------------------------------------------------------------
  const KEYPAD = {
    '4': ['left'],       '5': ['up'],   '6': ['right']
  };

  function bindMulti(el, keys, menuAction) {
    let pid = null;
    const on = e => {
      e.preventDefault(); unlockAudio();
      el.classList.add('down');
      if (mode === 'menu' || mode === 'pause') {
        if (menuAction) { menuAction(); return; }
        if (keys.indexOf('left') >= 0) moveSel(-1);
        else if (keys.indexOf('right') >= 0) moveSel(1);
        else press();
        return;
      }
      pid = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* older engines */ }
      for (const k of keys) setFrom('pad', k, true);
      if (mode !== 'play' && keys.length) press();
    };
    const off = e => {
      if (pid !== null && e.pointerId !== pid) return;
      e.preventDefault(); pid = null;
      el.classList.remove('down');
      for (const k of keys) setFrom('pad', k, false);
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
  }

  for (const el of document.querySelectorAll('#keypad .num')) {
    const keys = KEYPAD[el.dataset.k] || [];
    if (keys.length) el.classList.add('live');
    bindMulti(el, keys);
  }
  // The one round key beside the dish: pause / resume, and it wakes the
  // splash. Confirming is the dish, the canvas, key 5 or Enter.
  const softR = document.getElementById('softR');
  softR.addEventListener('pointerdown', e => {
    e.preventDefault(); unlockAudio();
    if (mode === 'play' || mode === 'pause') togglePause(); else if (mode === 'splash') openMenu();
  });
  // pressed look only; the action above fires on the same pointerdown
  softR.addEventListener('pointerdown', () => softR.classList.add('down'));
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) softR.addEventListener(t, () => softR.classList.remove('down'));
  // Floating stick: the base jumps to wherever the thumb lands, so there is
  // nothing small to hit. The jump pad is a separate pointer, so steering and
  // jumping never interrupt each other.
  const stickZone = document.getElementById('stickzone');
  const stickBase = document.getElementById('stickbase');
  const stickKnob = document.getElementById('stickknob');
  const R_MAX = 44, DEAD_X = 9, DEAD_Y = 18;   // up on the stick is the jump now
  let stickId = null, sx0 = 0, sy0 = 0;

  function knob(dx, dy) { stickKnob.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)'; }
  function restStick() {
    const r = stickZone.getBoundingClientRect();
    if (!r.width) return;
    const half = stickBase.offsetWidth / 2;
    stickBase.style.left = (r.width / 2 - half) + 'px';
    stickBase.style.top = (r.height / 2 - half) + 'px';
  }
  stickZone.addEventListener('pointerdown', e => {
    e.preventDefault(); unlockAudio();
    if (mode !== 'play') { press(); return; }
    stickId = e.pointerId;
    try { stickZone.setPointerCapture(e.pointerId); } catch (err) { /* older engines */ }
    sx0 = e.clientX; sy0 = e.clientY;
    const r = stickZone.getBoundingClientRect();
    const half = stickBase.offsetWidth / 2;
    stickBase.style.left = Math.max(0, Math.min(r.width - half * 2, e.clientX - r.left - half)) + 'px';
    stickBase.style.top = Math.max(0, Math.min(r.height - half * 2, e.clientY - r.top - half)) + 'px';
    stickBase.classList.add('active');
    knob(0, 0);
  });
  stickZone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    let dx = e.clientX - sx0, dy = e.clientY - sy0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > R_MAX) { dx = dx / d * R_MAX; dy = dy / d * R_MAX; }
    knob(dx, dy);
    setFrom('stick', 'left', dx < -DEAD_X);
    setFrom('stick', 'right', dx > DEAD_X);
    setFrom('stick', 'up', dy < -DEAD_Y);
  });
  const stickOff = e => {
    if (e.pointerId !== stickId) return;
    e.preventDefault(); stickId = null;
    stickBase.classList.remove('active');
    knob(0, 0);
    restStick();
    setFrom('stick', 'left', false); setFrom('stick', 'right', false); setFrom('stick', 'up', false);
  };
  stickZone.addEventListener('pointerup', stickOff);
  stickZone.addEventListener('pointercancel', stickOff);


  view.addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); tapAt(e.clientY); });

  // ------------------------------------------------------------------
  // Loop: fixed 40 ms ticks
  // ------------------------------------------------------------------
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(200, now - last); last = now;
    while (acc >= TICK_MS) { tick(); acc -= TICK_MS; }
    draw();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; });

  window.__bounce = () => ({ mode, level: levelNum, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, size: ball.size, rings, totalRings, lives, score, exitOpen: exit.open, state: ball.state, camRow, speed: ball.speedBonus });
  window.__bounceDbg = {
    teleport(x, y) { ball.x = x; ball.y = y; ball.vx = 0; ball.vy = 0; ball.grounded = false; },
    size(n) { setSize(n); },
    exitPos() { return [exit.col, exit.row]; },
    menu() { openMenu(); }, sel() { return [menuSel, pauseSel, hiScore, hasSave()]; },
    keys() { return { held: Object.assign({}, held), buffer: jumpBuffer, joystick, sources: JSON.parse(JSON.stringify(sources)) }; },
    setControls(j) { if (j !== joystick) toggleControls(); },
    setBufferTicks(n) { JUMP_BUFFER_TICKS = n; },
    probe(x, y) { const ok = collisionDetection(x, y); const h = ball.half; const t = []; for (let r = Math.trunc((y - h) / T); r < Math.trunc((y - 1 + h) / T) + 1; r++) for (let c = Math.trunc((x - h) / T); c < Math.trunc((x - 1 + h) / T) + 1; c++) t.push([r, c, map[r] ? map[r][c] : -1]); return { ok, t, grounded: ball.grounded }; },
    startLevel(n) { startLevel(n); },
    collectAll() { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const w = map[r][c] & 64, id = map[r][c] & 63; if (id === 13) { map[r][c] = 17 | w; rings++; } else if (id === 14) map[r][c] = 18 | w; else if (id === 15) { map[r][c] = 19 | w; rings++; } else if (id === 16) map[r][c] = 20 | w; else if (id === 21) { map[r][c] = 25 | w; rings++; } else if (id === 22) map[r][c] = 26 | w; else if (id === 23) { map[r][c] = 27 | w; rings++; } else if (id === 24) map[r][c] = 28 | w; } },
    renderLevel() { const c = mk(LEVEL_W, ROWS * T); drawWorld(c.getContext('2d'), 0, 0, LEVEL_W, ROWS * T); return c.toDataURL(); }
  };

  // The built page owns the <body> tag, so the felt-mat class and the initial
  // mode are stamped here, before the first paint.
  document.body.classList.add('ground');
  document.body.dataset.mode = mode;
  applyControls();
  restStick();
  loadGraphics().then(() => { loadHiScore(); loadLevel(1); resize(); requestAnimationFrame(frame); });
})();
</script>
