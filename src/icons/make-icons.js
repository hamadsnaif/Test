/* Home screen icon generator.
 *
 * Run it after changing the artwork:  node src/icons/make-icons.js
 * (needs Playwright's Chromium; it is not part of build.py, which must run
 * without a browser. The PNGs it writes are committed to the repo.)
 *
 * One mark, not three: the collection is a family of ivory handhelds now, so
 * the icon is that device seen face on — a shape no other icon on a home
 * screen has — with the red ball on its screen. Everything is drawn at the
 * target size rather than scaled down from one bitmap, so 120 is as crisp as
 * 512, and the maskable copy shrinks the device into Android's safe circle
 * while the background still bleeds to the edges.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');

const OUT = path.join(__dirname, '..', '..');
const SIZES = [120, 152, 167, 180, 192, 512];

const DRAW = function (ctx, S, scale) {
  const r = (x, y, w, h, rad) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
    else {
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
    }
    ctx.closePath();
  };

  // ---- the mat: never a flat fill, a warm pool of light ----
  const bg = ctx.createRadialGradient(S * 0.5, S * 0.16, S * 0.05, S * 0.5, S * 0.55, S * 0.78);
  bg.addColorStop(0, '#3b342c');
  bg.addColorStop(0.55, '#221e1a');
  bg.addColorStop(1, '#131110');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // ---- the device ----
  const w = S * 0.68 * scale, h = S * 0.86 * scale;   // the subject fills the tile; the maskable copy shrinks it into Android's circle
  const x = (S - w) / 2, y = (S - h) / 2;
  const rad = w * 0.17;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = S * 0.05;
  ctx.shadowOffsetY = S * 0.02;
  const body = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
  body.addColorStop(0, '#fbf7ee');
  body.addColorStop(0.45, '#eae3d2');
  body.addColorStop(1, '#cdc4ae');
  ctx.fillStyle = body;
  r(x, y, w, h, rad); ctx.fill();
  ctx.restore();

  // the moulded edge: a light top lip and a dark base line
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = Math.max(1, S * 0.004);
  r(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, rad); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,70,40,.35)';
  ctx.lineWidth = Math.max(1, S * 0.003);
  r(x, y, w, h, rad); ctx.stroke();

  // ---- the screen, and the three games inside it ----
  // The screen takes most of the face: one game on the icon said "a game",
  // three bands say "a collection", and colour blocks survive the shrink to a
  // home screen where fine detail does not.
  const pad = w * 0.075;
  const sw = w - pad * 2, sh = h * 0.72;
  const sx = x + pad, sy = y + h * 0.055;
  const bez = w * 0.026;
  ctx.fillStyle = '#1a1e24';
  r(sx - bez, sy - bez, sw + bez * 2, sh + bez * 2, w * 0.06); ctx.fill();
  ctx.strokeStyle = 'rgba(232,35,31,.7)';            // the anodized ring, in the family's red
  ctx.lineWidth = Math.max(1, S * 0.005);
  r(sx - bez, sy - bez, sw + bez * 2, sh + bez * 2, w * 0.06); ctx.stroke();

  ctx.save();
  r(sx, sy, sw, sh, w * 0.025); ctx.clip();
  ctx.fillStyle = '#0d1116'; ctx.fillRect(sx, sy, sw, sh);   // what shows through the channels

  /* The screen is cut by two 45 degree lines into three slices with a dark
     channel between them, so the games read as three separate things rather
     than one busy picture. The slice through the middle is the widest, so the
     red ball lives there; the two corners take the other two. Backgrounds are
     painted inside a rotated clip, the marks upright inside it, because a
     tetromino turned on its corner stops looking like a tetromino. */
  const cxs = sx + sw / 2, cys = sy + sh / 2, L = Math.max(sw, sh);
  const gap = L * 0.030;                  // the channel between two games
  const mid = L * 0.175;                  // half height of the middle slice
  const D = 0.7071;                       // cos 45, the step along the diagonal

  function slice(from, to, paint) {
    ctx.save();
    ctx.translate(cxs, cys); ctx.rotate(-Math.PI / 4);
    ctx.beginPath(); ctx.rect(-L, from, L * 2, to - from); ctx.clip();
    ctx.rotate(Math.PI / 4); ctx.translate(-cxs, -cys);
    paint();
    ctx.restore();
  }
  // the centre of a slice, in screen coordinates
  const at = off => [cxs + off * D, cys + off * D];

  // 1. Snake — the upper left corner, crawling up the diagonal
  slice(-L, -mid - gap / 2, () => {
    ctx.fillStyle = '#9bbc0f'; ctx.fillRect(sx, sy, sw, sh);
    const [mx, my] = at(-L * 0.36), seg = L * 0.088, step = seg * 1.14;
    // the four segments are centred on the slice, not hung off one end of it
    const x0 = mx - (3 * step + seg) / 2, y0 = my + (3 * step - seg) / 2;
    for (let i = 0; i < 4; i++) {
      const bx0 = x0 + i * step, by0 = y0 - i * step;
      ctx.fillStyle = '#0f380f'; ctx.fillRect(bx0, by0, seg, seg);
      if (i < 3) { ctx.fillStyle = '#306230'; ctx.fillRect(bx0 + seg * 0.1, by0 + seg * 0.1, seg * 0.62, seg * 0.62); }
    }
    ctx.fillStyle = '#0f380f';
    ctx.fillRect(x0 + 4.05 * step, y0 - 4.05 * step + seg * 0.2, seg * 0.55, seg * 0.55);   // the pellet ahead
  });

  // 2. Bounce — the middle slice, the widest, the hero
  slice(-mid + gap / 2, mid - gap / 2, () => {
    const sky = ctx.createLinearGradient(0, sy, 0, sy + sh);
    sky.addColorStop(0, '#c4ebf7'); sky.addColorStop(1, '#9fd5ea');
    ctx.fillStyle = sky; ctx.fillRect(sx, sy, sw, sh);
    const br = L * 0.148;
    ctx.fillStyle = '#8f0d0a'; ctx.beginPath(); ctx.arc(cxs, cys, br, 0, Math.PI * 2); ctx.fill();
    const ball = ctx.createRadialGradient(cxs - br * 0.35, cys - br * 0.4, br * 0.1, cxs, cys, br);
    ball.addColorStop(0, '#ff5a52'); ball.addColorStop(0.55, '#e8231f'); ball.addColorStop(1, '#b8130f');
    ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(cxs, cys, br * 0.86, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.ellipse(cxs - br * 0.33, cys - br * 0.36, br * 0.2, br * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
  });

  // 3. Tetris — the lower right corner, one piece on lit glass
  slice(mid + gap / 2, L, () => {
    ctx.fillStyle = '#16211a'; ctx.fillRect(sx, sy, sw, sh);
    const [mx, my] = at(L * 0.36), blk = L * 0.095;
    const piece = [[0, 0, '#5ab7c4'], [1, 0, '#5ab7c4'], [1, 1, '#e3c65f'], [2, 1, '#e3c65f']];
    for (const [ci, cj, col] of piece) {
      const bx0 = mx - blk * 1.59 + ci * blk * 1.06, by0 = my - blk * 1.03 + cj * blk * 1.06;
      ctx.fillStyle = col; ctx.fillRect(bx0, by0, blk, blk);
      ctx.fillStyle = 'rgba(255,250,240,.8)'; ctx.fillRect(bx0, by0, blk, Math.max(1, blk * 0.18));
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(bx0, by0 + blk - Math.max(1, blk * 0.18), blk, Math.max(1, blk * 0.18));
    }
  });

  // the channels themselves: the dark screen showing between the slices
  const glass = ctx.createLinearGradient(sx, sy, sx + sw * 0.8, sy + sh);
  glass.addColorStop(0, 'rgba(255,255,255,.20)');
  glass.addColorStop(0.32, 'rgba(255,255,255,0)');
  ctx.fillStyle = glass; ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();

  // ---- the control strip: enough device to be a device ----
  const dy = sy + sh + h * 0.045, dh = h * 0.105, dw = w * 0.66;
  const dx = x + (w - dw) / 2;
  ctx.fillStyle = '#23272e';
  r(dx, dy, dw, dh, dh / 2); ctx.fill();
  const knob = ctx.createRadialGradient(dx + dw / 2 - dh * 0.12, dy + dh * 0.32, dh * 0.05, dx + dw / 2, dy + dh / 2, dh * 0.5);
  knob.addColorStop(0, '#6a727e'); knob.addColorStop(1, '#2c3039');
  ctx.fillStyle = knob;
  ctx.beginPath(); ctx.arc(dx + dw / 2, dy + dh / 2, dh * 0.40, 0, Math.PI * 2); ctx.fill();
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  const jobs = SIZES.map(s => ({ name: `icon-${s}.png`, size: s, scale: 1 }))
    .concat([{ name: 'icon-maskable-512.png', size: 512, scale: 0.72 }]);
  const out = await page.evaluate(({ jobs, src }) => {
    const draw = new Function('return ' + src)();
    const res = {};
    for (const j of jobs) {
      const c = document.createElement('canvas');
      c.width = c.height = j.size;
      const ctx = c.getContext('2d');
      draw(ctx, j.size, j.scale);
      res[j.name] = c.toDataURL('image/png');
    }
    return res;
  }, { jobs, src: DRAW.toString() });
  for (const [name, url] of Object.entries(out)) {
    fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
  }
  fs.copyFileSync(path.join(OUT, 'icon-180.png'), path.join(OUT, 'apple-touch-icon.png'));
  console.log('wrote', Object.keys(out).join(', '), '+ apple-touch-icon.png');
  await browser.close();
})();
