#!/usr/bin/env python3
"""يحزم رسوم Frozen Bubble الأصلية وأصواتها.

الرسوم من مستودع اللعبة نفسه (‏kthakore/frozen-bubble‏) وهي برخصة GPL v2
كالشيفرة، والصفحة كلّها بهذه الرخصة — فنسخها هنا سليم، وإسنادها في رأس
الصفحة وفي README.

لا يُشغَّل مع `build.py`: يحتاج نسخةً من مستودع اللعبة و Pillow، و`build.py`
يجب أن يعمل بلا كليهما. وناتجه `assets.b64.json` محفوظ في المستودع.

الأصوات: ملفّات الأصل ‎.ogg‎ لا تشغّلها سفاري، والمجموعة كلّها موجّهة إلى
الآيفون — فتُفكّ وتُرمَّز MP3 الذي تشغّله المتصفّحات كلّها. المؤثّرات تدخل
الحزمة، والموسيقى تُكتب ملفّاً مستقلّاً في جذر المستودع (‎٣٫٢‎ ميغابايت لا
تُخبَز في صفحة) يُجلب عند أوّل جولة — وهو عرف `cadet.wasm` نفسه.

    python3 src/frozen/pack.py /path/to/frozen-bubble
"""
import base64, io, json, os, sys
import numpy as np
import soundfile as sf
import lameenc
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/user/kthakore/frozen-bubble'
GFX = os.path.join(SRC, 'share', 'gfx')
SND = os.path.join(SRC, 'share', 'snd')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'assets.b64.json')
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
MUSIC_OUT = os.path.join(REPO, 'frozen-mainzik.mp3')

# عمود الملعب من شاشة اللاعب الواحد: يضمّ الإطار والملعب والإغلو والعارضة
CROP_X0, CROP_X1 = 176, 460          # 284 عرضاً
CROP_Y0, CROP_Y1 = 0, 480            # 480 طولاً

# البطريق: ٧١ إطاراً في الأصل، نأخذ منها أحد عشر تمتدّ من أقصى اليسار إلى
# أقصى اليمين. (١ أقصى اليسار، ٢٠ الوسط، ٧١ أقصى اليمين — و٢١..٥٠ إطارات
# القذف لا الالتفات، فتُتجاوز.)
PENG_FRAMES = [1, 5, 9, 13, 17, 20, 55, 59, 63, 67, 71]

# المؤثّرات التي يشغّلها طور اللاعب الواحد، بأسمائها في الأصل. ومواضع
# ‎play_sound‎ لكلٍّ منها مذكورة في رأس صفحة اللعبة.
SFX = ['launch', 'stick', 'destroy_group', 'rebound', 'newroot_solo',
       'hurry', 'lose', 'applause', 'pause']
SFX_KBPS = 64        # أحاديّ: مؤثّراتٌ قصيرة قرعيّة، ٦٤ تكفيها (قِيست)
MUSIC_KBPS = 80      # ستيريو: ‎٣٫٢٢‎ ميغابايت، أي حجم ملفّ الأصل نفسه


def mp3(data, rate, kbps, channels):
    """يرمّز PCM إلى MP3. والسبب في رأس الملفّ: سفاري لا تشغّل Ogg Vorbis."""
    e = lameenc.Encoder()
    e.set_bit_rate(kbps)
    e.set_in_sample_rate(rate)
    e.set_channels(channels)
    e.set_quality(2 if channels == 1 else 5)
    pcm = (np.clip(data, -1.0, 1.0) * 32767).astype('<i2').tobytes()
    return e.encode(pcm) + e.flush()


def load(rel):
    return Image.open(os.path.join(GFX, rel)).convert('RGBA')


def has_alpha(im):
    if 'A' not in im.getbands():
        return False
    lo, _ = im.getchannel('A').getextrema()
    return lo < 255


def enc(im, quant=0):
    """PNG مضغوط، ومُفهرَس إن طُلب ذلك وكان أصغر.

    والفهرسة للمُعتِم وحده: `convert('RGB')` يطرح قناة الشفافية، فلو فُهرِس
    سبرايت بشفافية لجاء بمربّعٍ أبيض حوله — وهذا وقع فعلاً في البطريق قبل
    أن يُقيَّد هذا الشرط.
    """
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    best = buf.getvalue()
    if quant and not has_alpha(im):
        q = im.convert('RGB').quantize(colors=quant, method=Image.MEDIANCUT)
        b2 = io.BytesIO()
        q.save(b2, 'PNG', optimize=True)
        if len(b2.getvalue()) < len(best):
            best = b2.getvalue()
    return 'data:image/png;base64,' + base64.b64encode(best).decode(), len(best)


def trim(im):
    """يقصّ الهامش الشفّاف: لا يغيّر الرسم، ويوفّر بايتاته."""
    box = im.getchannel('A').getbbox()
    return im.crop(box) if box else im


def rgbquant(im, colors):
    """يقلّل ألوان RGB ويُبقي قناة الشفافية كما هي.

    `quantize` يطرح الشفافية، فتُفصل القنوات ويُفهرَس الملوّن وحده ثم تُعاد
    الشفافية إليه. الخطأ مقيسٌ داخل الرسم لا في هامشه: ٩٦ لوناً تعطي متوسّط
    ‎٣٫٢‎ من ٢٥٥ على البطريق و‎٢٫٧‎ على HURRY — أقلّ من أن يُرى.
    """
    r, g, b, a = im.split()
    q = Image.merge('RGB', (r, g, b)).quantize(colors=colors, method=Image.MEDIANCUT).convert('RGB')
    return Image.merge('RGBA', q.split() + (a,))


def strip(images):
    w = max(i.width for i in images)
    h = max(i.height for i in images)
    sheet = Image.new('RGBA', (w * len(images), h), (0, 0, 0, 0))
    for n, i in enumerate(images):
        sheet.paste(i, (n * w, 0))
    return sheet


def main():
    assets, sounds, sizes = {}, {}, {}

    def put(key, im, quant=0):
        uri, n = enc(im, quant)
        assets[key] = uri
        sizes[key] = n

    bg = Image.open(os.path.join(GFX, 'back_one_player.png')).convert('RGB')
    # ٢٥٦ لوناً: متوسّط الخطأ ‎١٫٧٨‎ من ٢٥٥ وثلث الحجم (مقيس)
    put('bg', bg.crop((CROP_X0, CROP_Y0, CROP_X1, CROP_Y1)), quant=256)
    # اللافتة الخشبية التي يُطبع عليها رقم المستوى في الأصل (scores x=74 y=103)
    put('sign', bg.crop((4, 83, 152, 142)), quant=128)

    put('balls', strip([load('balls/bubble-%d.gif' % n) for n in range(1, 9)]))
    put('prelight', load('balls/bubble_prelight.png'))
    put('ring', load('on_top_next.png'))
    put('shooter', load('shooter.png'))
    put('comp_main', load('compressor_main.png'))
    put('comp_ext', load('compressor_ext.png'))
    put('stick', strip([load('balls/stick_effect_%d.png' % n) for n in range(7)]))
    put('peng', rgbquant(strip([load('pinguins/anime-shooter_p1_%04d.png' % n)
                                for n in PENG_FRAMES]), 96))
    hurry = load('hurry_p1.png')
    hu = hurry.getchannel('A').getbbox()
    put('hurry', rgbquant(trim(hurry), 96))
    meta_hurry = [hu[0], hu[1]] if hu else [0, 0]
    put('dot_r', load('dot_red.png'))
    put('dot_g', load('dot_green.png'))

    # ---- المؤثّرات: تُفكّ من ogg الأصل وتُرمَّز MP3 أحاديّاً ----
    for n in SFX:
        d, sr = sf.read(os.path.join(SND, n + '.ogg'), dtype='float32', always_2d=True)
        raw = mp3(d.mean(axis=1), sr, SFX_KBPS, 1)
        sounds[n] = 'data:audio/mpeg;base64,' + base64.b64encode(raw).decode()
        sizes['snd:' + n] = len(raw)

    # ---- الموسيقى: ملفٌّ مستقلّ في الجذر، لا تُخبَز في الصفحة ----
    d, sr = sf.read(os.path.join(SND, 'frozen-mainzik-1p.ogg'), dtype='float32', always_2d=True)
    open(MUSIC_OUT, 'wb').write(mp3(d, sr, MUSIC_KBPS, d.shape[1]))
    print('music -> %s  %.2f MB  (%.0f s, %d ch, %d kbps)'
          % (MUSIC_OUT, os.path.getsize(MUSIC_OUT) / 1e6, len(d) / sr, d.shape[1], MUSIC_KBPS))

    meta = {
        'crop': [CROP_X0, CROP_Y0, CROP_X1 - CROP_X0, CROP_Y1 - CROP_Y0],
        'sfx': SFX,
        'music': 'frozen-mainzik.mp3',
        'peng_frames': PENG_FRAMES,
        'ball': 32, 'peng': [80, 60], 'stick': 32,
        # إزاحة ما قُصّ من هامش HURRY الشفّاف، فيُرسم في موضع الأصل بالضبط
        'hurry_off': meta_hurry,
    }
    json.dump({'meta': meta, 'img': assets, 'snd': sounds}, open(OUT, 'w'), indent=0)

    both = dict(assets)
    both.update({'snd:' + k: v for k, v in sounds.items()})
    total = sum(sizes.values())
    for k in sorted(sizes, key=lambda k: -sizes[k]):
        print('%-18s %8d bytes  -> %8d base64' % (k, sizes[k], len(both[k])))
    print('-' * 54)
    print('%-18s %8d bytes  -> %8d base64' % ('TOTAL', total, sum(len(v) for v in both.values())))
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


main()
