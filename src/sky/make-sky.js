/* مولّد خلفية الطاولة الفضائية.
 *
 *   node src/sky/make-sky.js
 *
 * ينزّل صورة سديم من ويكيميديا كومنز (ملك عام، NASA/JPL-Caltech) ثم يعيد
 * تلوينها على لوحة الطاولة ويكتبها في جذر المستودع باسم pinball-sky.jpg.
 * الناتج يُحفظ في المستودع، والسكربت للتجديد فقط — فهو خارج build.py الذي
 * يجب أن يعمل بلا متصفّح وبلا شبكة.
 *
 * لماذا إعادة التلوين لا استعمال الصورة كما هي: الأصل صورة أشعّة تحت حمراء
 * من Spitzer، خضراء وبرتقالية، وهي تضرب أرجوانيّ الطاولة. فتُحوَّل إلى
 * سُلَّم لونيّ من النيلي الداكن إلى الأرجواني إلى الأرجواني الورديّ إلى
 * الأبيض، ويُمزج ١٨٪ من لون الأصل كي لا تصير مسطّحة. البنية بنية سديم
 * حقيقي، واللون لوننا.
 *
 * المصدر: https://commons.wikimedia.org/wiki/File:Released_to_Public_The_Trifid_Nebula_(NASA)_(411777678).jpg
 * الرخصة: ملك عام (PD-USGov-NASA). تصوير NASA / JPL-Caltech / J. Rho (SSC/Caltech).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');

const SRC = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/' +
  'Released_to_Public_The_Trifid_Nebula_%28NASA%29_%28411777678%29.jpg/' +
  '1280px-Released_to_Public_The_Trifid_Nebula_%28NASA%29_%28411777678%29.jpg';
const OUT = path.join(__dirname, '..', '..', 'pinball-sky.jpg');
const CACHE = path.join(__dirname, 'source.jpg');
// المقاس والجودة يُضبطان من البيئة للموازنة بين الوضوح والبايتات:
//   SKY_W=700 SKY_H=1140 SKY_Q=0.62 node src/sky/make-sky.js
const W = +(process.env.SKY_W || 760), H = +(process.env.SKY_H || 1240);
const QUALITY = +(process.env.SKY_Q || 0.72);

function download(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'HamadsGames/1.0 (https://hamadsnaif.github.io/Test/)' } };
    https.get(url, opts, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  let src;
  if (fs.existsSync(CACHE)) { src = fs.readFileSync(CACHE); console.log('using cached source.jpg'); }
  else { src = await download(SRC); fs.writeFileSync(CACHE, src); console.log('downloaded ' + src.length + ' bytes'); }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dataUrl = 'data:image/jpeg;base64,' + src.toString('base64');
  const out = await page.evaluate(async ({ dataUrl, W, H, QUALITY }) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    // اقتصاص يملأ الإطار مع حفظ النسبة
    const s = Math.max(W / img.width, H / img.height);
    const dw = img.width * s, dh = img.height * s;
    x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

    // سُلَّم ألوان الطاولة: نيلي داكن ← أرجواني ← وردي ← أبيض
    const STOPS = [[0, 10, 5, 24], [0.22, 38, 16, 78], [0.45, 96, 40, 158],
                   [0.68, 178, 70, 200], [0.86, 255, 152, 208], [1, 255, 242, 255]];
    const LUT = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let k = 0; while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
      const a = STOPS[k], b = STOPS[k + 1];
      const u = (t - a[0]) / (b[0] - a[0] || 1);
      LUT[i * 3] = a[1] + (b[1] - a[1]) * u;
      LUT[i * 3 + 1] = a[2] + (b[2] - a[2]) * u;
      LUT[i * 3 + 2] = a[3] + (b[3] - a[3]) * u;
    }
    const d = x.getImageData(0, 0, W, H), D = d.data, KEEP = 0.18;
    for (let i = 0; i < D.length; i += 4) {
      const r = D[i], g = D[i + 1], bl = D[i + 2];
      const lum = (r * 0.299 + g * 0.587 + bl * 0.114) | 0;
      D[i]     = LUT[lum * 3]     * (1 - KEEP) + r  * KEEP;
      D[i + 1] = LUT[lum * 3 + 1] * (1 - KEEP) + g  * KEEP;
      D[i + 2] = LUT[lum * 3 + 2] * (1 - KEEP) + bl * KEEP;
    }
    x.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', QUALITY);
  }, { dataUrl, W, H, QUALITY });
  await browser.close();

  const bytes = Buffer.from(out.split(',')[1], 'base64');
  fs.writeFileSync(OUT, bytes);
  console.log('wrote ' + path.basename(OUT) + '  ' + W + 'x' + H + '  ' + (bytes.length / 1024).toFixed(1) + ' KB');
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
