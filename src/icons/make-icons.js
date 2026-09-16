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

  // ---- the screen plate ----
  const pad = w * 0.085;
  const sw = w - pad * 2, sh = sw;                 // square picture, like the game
  const sx = x + pad, sy = y + h * 0.075;
  ctx.fillStyle = '#1a1e24';
  r(sx - w * 0.028, sy - w * 0.028, sw + w * 0.056, sh + w * 0.056, w * 0.07); ctx.fill();
  ctx.strokeStyle = 'rgba(232,35,31,.75)';          // the anodized ring, in the game's red
  ctx.lineWidth = Math.max(1, S * 0.006);
  r(sx - w * 0.028, sy - w * 0.028, sw + w * 0.056, sh + w * 0.056, w * 0.07); ctx.stroke();

  // sky, bricks, ball: the one picture everybody recognises
  ctx.save();
  r(sx, sy, sw, sh, w * 0.03); ctx.clip();
  const sky = ctx.createLinearGradient(0, sy, 0, sy + sh);
  sky.addColorStop(0, '#bfe8f6');
  sky.addColorStop(1, '#a3d8ec');
  ctx.fillStyle = sky; ctx.fillRect(sx, sy, sw, sh);
  const bh = sh * 0.22, by = sy + sh - bh;
  ctx.fillStyle = '#c8722a'; ctx.fillRect(sx, by, sw, bh);
  ctx.fillStyle = '#e59a4d';
  const cols = 4, cw = sw / cols;
  for (let i = 0; i < cols; i++) {
    ctx.fillRect(sx + i * cw + cw * 0.06, by + bh * 0.14, cw * 0.88, bh * 0.28);
    ctx.fillRect(sx + i * cw + cw * 0.06, by + bh * 0.58, cw * 0.88, bh * 0.28);
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx, by, sw, Math.max(1, S * 0.004));
  const br = sw * 0.27, bx = sx + sw / 2, byy = by - br * 0.92;
  ctx.fillStyle = '#8f0d0a'; ctx.beginPath(); ctx.arc(bx, byy, br, 0, Math.PI * 2); ctx.fill();
  const ball = ctx.createRadialGradient(bx - br * 0.35, byy - br * 0.4, br * 0.1, bx, byy, br);
  ball.addColorStop(0, '#ff5a52');
  ball.addColorStop(0.55, '#e8231f');
  ball.addColorStop(1, '#b8130f');
  ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(bx, byy, br * 0.86, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.ellipse(bx - br * 0.34, byy - br * 0.38, br * 0.2, br * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
  // glass
  const glass = ctx.createLinearGradient(sx, sy, sx + sw * 0.7, sy + sh);
  glass.addColorStop(0, 'rgba(255,255,255,.22)');
  glass.addColorStop(0.35, 'rgba(255,255,255,0)');
  ctx.fillStyle = glass; ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();

  // ---- the dish, where the thumb goes ----
  const dy = sy + sh + h * 0.10, dh = h * 0.155, dw = w * 0.74;
  const dx = x + (w - dw) / 2;
  ctx.fillStyle = '#23272e';
  r(dx, dy, dw, dh, dh / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = Math.max(1, S * 0.003);
  r(dx, dy, dw, dh, dh / 2); ctx.stroke();
  const knob = ctx.createRadialGradient(dx + dw / 2 - dh * 0.12, dy + dh * 0.32, dh * 0.05, dx + dw / 2, dy + dh / 2, dh * 0.5);
  knob.addColorStop(0, '#666e7a');
  knob.addColorStop(1, '#2c3039');
  ctx.fillStyle = knob;
  ctx.beginPath(); ctx.arc(dx + dw / 2, dy + dh / 2, dh * 0.42, 0, Math.PI * 2); ctx.fill();
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
