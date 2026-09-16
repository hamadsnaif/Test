#!/usr/bin/env python3
"""Build the published files from the sources in this directory.

    python3 src/build.py            write the files
    python3 src/build.py --check    only report whether they are up to date

Writes into the repository root: index.html, sw.js, bounce.html, snake.html,
tetris.html, pinball.html and manifest.webmanifest. It also writes src/build/, which is
ignored by git and holds a single file copy of the whole collection.

games.json is an INPUT, never an output. Adding a game means editing that file
and dropping its page in the root; you do not need to run this at all for that.
Run it when you change the launcher, the Bounce engine, or the worker.
"""

import base64, hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BUILD_DIR = os.path.join(HERE, 'build')
CHECK = '--check' in sys.argv[1:]

WRITTEN = {}


def emit(path, text):
    """Collect an output instead of writing it, so --check can compare first."""
    WRITTEN[path] = text.encode() if isinstance(text, str) else text


def have(path):
    """Is this page going to exist, counting what this run has produced?

    Outputs are buffered rather than written as they are made, so asking the
    disk alone answers "no" for every page this run is about to write. Building
    a clean checkout would then quietly leave the games out of the worker's
    offline list and out of the single file build.
    """
    return path in WRITTEN or os.path.exists(path)

ICON_LINKS = (
    '<link rel="apple-touch-icon" href="./apple-touch-icon.png">\n'
    '<link rel="apple-touch-icon" sizes="180x180" href="./icon-180.png">\n'
    '<link rel="apple-touch-icon" sizes="167x167" href="./icon-167.png">\n'
    '<link rel="apple-touch-icon" sizes="152x152" href="./icon-152.png">\n'
    '<link rel="apple-touch-icon" sizes="120x120" href="./icon-120.png">\n'
    '<link rel="icon" sizes="192x192" href="./icon-192.png" type="image/png">\n'
)
# Keep the collection out of search results. robots.txt would be the usual
# answer, but it only has any effect at the origin root
# (hamadsnaif.github.io/robots.txt), which is served by a different repository —
# a copy inside this project would sit at /Test/robots.txt and be ignored. The
# meta tag is what search engines actually honour for a page like this.
NOINDEX = '<meta name="robots" content="noindex, nofollow">'

# A game page carries apple-mobile-web-app-capable and its own title, so it can
# be added to the Home Screen by itself — but on iOS such an app gets its own
# website data store, so the launcher's worker does not reach it and without
# this it would have no offline support at all. The protocol gate matters: these
# pages are also inlined into the single file build and injected with srcdoc,
# where a relative URL resolves against whatever host that page is opened from.
SW_REGISTER = (
    "<script>if('serviceWorker' in navigator && /^https?:$/.test(location.protocol))"
    "addEventListener('load',function(){navigator.serviceWorker"
    ".register('sw.js',{updateViaCache:'none'}).catch(function(){});});</script>"
)

WEBAPP_META = [
    ('apple-mobile-web-app-capable', '<meta name="apple-mobile-web-app-capable" content="yes">'),
    ('mobile-web-app-capable', '<meta name="mobile-web-app-capable" content="yes">'),
    ('apple-mobile-web-app-status-bar-style',
     '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'),
]


def with_app_head(html, title):
    """Insert icon links and the iOS web-app meta tags a game page is missing.

    Head-only: nothing here changes how a game plays, it only lets iOS show an
    icon and open the page full screen when a game is added on its own.
    """
    add = ICON_LINKS
    if 'name="robots"' not in html:
        add += NOINDEX + '\n'
    if 'serviceWorker' not in html:
        add += SW_REGISTER + '\n'
    for name, tag in WEBAPP_META:
        if f'name="{name}"' not in html:
            add += tag + '\n'
    if 'apple-mobile-web-app-title' not in html:
        add += f'<meta name="apple-mobile-web-app-title" content="{title}">\n'
    marker = '<meta charset="UTF-8">'
    if marker not in html:
        marker = '<head>'
    assert marker in html, 'no head marker'
    html = html.replace(marker, marker + '\n' + add, 1)
    # viewport-fit=cover so the notch is handled once the page runs full screen
    if 'viewport-fit=cover' not in html:
        html = html.replace('user-scalable=no', 'user-scalable=no, viewport-fit=cover', 1)
    return html

G = os.path.join(HERE, 'games')

# The shelf reads games.json at runtime, and this build only bakes a copy of it
# in as the offline fallback. Everything downstream — which pages get an app
# head, what the worker keeps offline — follows from that one file.
REGISTRY = json.load(open(os.path.join(REPO, 'games.json')))
ENTRIES = REGISTRY['games']


# ---------- 1. the Bounce page (same engine, built as a standalone document)
head = open(os.path.join(HERE, 'bounce', 'shell.html')).read()
eng = open(os.path.join(HERE, 'bounce', 'engine.js')).read()
sheet = open(os.path.join(HERE, 'bounce', 'sheet.b64')).read().strip()
splash = open(os.path.join(HERE, 'bounce', 'splash.b64')).read().strip()
levels = open(os.path.join(HERE, 'bounce', 'levels.js')).read()
bounce_frag = head + eng.replace('__SHEET__', sheet).replace('__SPLASH__', splash).replace('__LEVELS__', levels)
bounce_frag = bounce_frag.replace('نوكيا، المرحلة الأولى الأصلية', 'نوكيا، المراحل الإحدى عشرة الأصلية')
emit(os.path.join(BUILD_DIR, 'bounce.html'), bounce_frag)   # the game on its own

DOC_HEAD = ('<!DOCTYPE html>\n<html lang="ar">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0, '
            'maximum-scale=1.0, user-scalable=no, viewport-fit=cover">\n')
bounce_doc = DOC_HEAD + bounce_frag.replace('</style>\n\n<div id="shell">',
                                            '</style>\n</head>\n<body>\n<div id="shell">') + '</body>\n</html>\n'
emit(os.path.join(REPO, 'bounce.html'), with_app_head(bounce_doc, 'Bounce'))
TITLES = {'snake': 'Snake II', 'tetris': 'Tetris', 'pinball': 'Pinball'}
for e in ENTRIES:
    if e['id'] == 'bounce':
        continue                                    # built from source above
    src = os.path.join(G, e['file'])
    if not os.path.exists(src):
        continue                                    # a page added straight to the repo
    emit(os.path.join(REPO, e['file']),
         with_app_head(open(src).read(), TITLES.get(e['id'], e.get('en') or e['id'])))

# ---------- 2. the launcher
hub = open(os.path.join(HERE, 'launcher.html')).read()

# repo build: the games are real files next to the launcher, so the shelf needs
# no inline copies and can read games.json live
REGISTRY_JSON = json.dumps(REGISTRY, ensure_ascii=False)


def fill(html, registry_json, sources, live):
    return (html.replace('__REGISTRY__', registry_json)
                .replace('__SOURCES__', json.dumps(sources, ensure_ascii=False))
                .replace('__LIVE__', 'true' if live else 'false'))
PWA_HEAD = ('<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0, '
            'maximum-scale=1.0, user-scalable=no, viewport-fit=cover">\n'
            '<meta name="theme-color" content="#14171c">\n'
            + NOINDEX + '\n' +
            '<meta name="apple-mobile-web-app-title" content="Hamad\'s Games">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n'
            '<link rel="manifest" href="./manifest.webmanifest">\n'
            '<link rel="apple-touch-icon" href="./apple-touch-icon.png">\n'
            '<link rel="apple-touch-icon" sizes="180x180" href="./icon-180.png">\n'
            '<link rel="apple-touch-icon" sizes="167x167" href="./icon-167.png">\n'
            '<link rel="apple-touch-icon" sizes="152x152" href="./icon-152.png">\n'
            '<link rel="apple-touch-icon" sizes="120x120" href="./icon-120.png">\n'
            '<link rel="icon" sizes="192x192" href="./icon-192.png" type="image/png">\n'
            '<link rel="icon" sizes="512x512" href="./icon-512.png" type="image/png">\n')
repo_hub = fill(hub, REGISTRY_JSON, {}, True)
repo_hub = PWA_HEAD + repo_hub.replace('</style>\n\n<div id="shelf">', '</style>\n</head>\n<body>\n<div id="shelf">')
emit(os.path.join(REPO, 'index.html'), repo_hub + '</body>\n</html>\n')

# artifact build: every game is carried inside the page itself
def b64(path):
    # read what this run produced, so the single file build can never carry a
    # different version of a game than the one being published
    if path in WRITTEN:
        return base64.b64encode(WRITTEN[path]).decode()
    return base64.b64encode(open(path, 'rb').read()).decode()

art_sources = {e['id']: {'b64': b64(os.path.join(REPO, e['file']))}
               for e in ENTRIES if have(os.path.join(REPO, e['file']))}
emit(os.path.join(BUILD_DIR, 'hamads-games.html'), fill(hub, REGISTRY_JSON, art_sources, False))

# ---------- 3. app files
emit(os.path.join(REPO, 'manifest.webmanifest'), json.dumps({
    "name": "Hamad's Games",
    "short_name": "Hamad's Games",
    "description": "أربع ألعاب: الكرة الحمراء، الدودة، تتريس، وبينبول الفضاء.",
    "start_url": "./index.html",
    "scope": "./",
    "display": "fullscreen",
    "display_override": ["fullscreen", "standalone"],
    "orientation": "any",
    "background_color": "#14171c",
    "theme_color": "#14171c",
    "lang": "ar",
    "dir": "rtl",
    "icons": [
        {"src": "./icon-120.png", "sizes": "120x120", "type": "image/png"},
        {"src": "./icon-152.png", "sizes": "152x152", "type": "image/png"},
        {"src": "./icon-167.png", "sizes": "167x167", "type": "image/png"},
        {"src": "./icon-180.png", "sizes": "180x180", "type": "image/png"},
        {"src": "./icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "./icon-512.png", "sizes": "512x512", "type": "image/png"},
        # Android crops a maskable icon to its own shape, so that one is drawn
        # with the device shrunk inside the safe circle rather than edge to edge
        {"src": "./icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ]
}, ensure_ascii=False, indent=2) + '\n')

# ---------- 4. the service worker
#
# Two jobs, and the second one is why it is shaped this way. Offline is easy:
# keep a copy of every file. Staying current is the hard half — someone who
# added the shelf to their home screen months ago must see a new game without
# doing anything — so pages and games.json are fetched from the network first
# and only fall back to the cache, and the cache name carries a hash of the
# build so a deploy makes the browser notice a new worker and throw the old
# copies away.

CACHED = ['./', './index.html', './games.json', './manifest.webmanifest',
          './apple-touch-icon.png', './icon-120.png', './icon-152.png',
          './icon-167.png', './icon-180.png', './icon-192.png']
# The two 512s are deliberately not in that list. They are read once, by the
# operating system, at the moment someone installs the app — which can only
# happen online — and after that the icon lives on the home screen, not in a
# cache. Keeping them would put 140KB on every visitor's first load for a file
# they never fetch twice.
CACHED += ['./' + e['file'] for e in ENTRIES if have(os.path.join(REPO, e['file']))]
CACHED = sorted(set(CACHED))

SW_BODY = r"""// Offline cache for Hamad's Games, and the path new versions travel down.
//
// BUILD is a version of this worker's *behaviour*, not of the site's content —
// it is a hash of the code below plus the list of files it keeps offline. It
// deliberately does not change when a game or games.json changes, because those
// are read from the network first and need no new worker to arrive. Editing a
// game therefore costs nobody a re-download of the other 400KB.
const BUILD = '%(build)s';
const CACHE = 'hamads-games';
const ASSETS = %(assets)s;
const NET_TIMEOUT = 4000;
const REGISTRY_TIMEOUT = 10000;   // games.json is a kilobyte; give it real room

self.addEventListener('install', e => {
  // 'no-cache' here too, or a first install can bake in a copy that GitHub
  // Pages had already been serving for ten minutes. One unreachable asset must
  // not wipe out offline support for the rest, hence allSettled.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(u =>
        fetch(u, { cache: 'no-cache', credentials: 'same-origin' })
          .then(res => (res && res.ok ? c.put(u, res) : null))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Only ever sweep our own caches. Cache Storage is partitioned per origin and
  // github.io is one origin for every repo this account publishes, so a bare
  // "delete everything that is not mine" would take out other projects.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('hamads-games') && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The shelf hands over any game added to games.json since this build, so a game
// that was not around at build time still works offline afterwards.
self.addEventListener('message', e => {
  const d = e.data;
  if (!d || d.type !== 'cache' || !Array.isArray(d.urls)) return;
  const urls = d.urls
    .filter(u => typeof u === 'string' && u && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('/'))
    .slice(0, 64)
    .map(u => new URL(u, self.registration.scope).href)
    .filter(u => u.startsWith(self.registration.scope));
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(
    urls.map(u => c.match(u).then(hit => (hit ? null : c.add(u))))
  )));
});

// A response that followed a redirect cannot be handed back from respondWith
// for a navigation: the request's redirect mode is 'manual' and the browser
// rejects it, which fails the launch outright. github.io/Test redirects to
// github.io/Test/, so this is the ordinary way in, not an edge case. Rebuilding
// the response clears the flag.
function unredirect(res) {
  if (!res || !res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function store(req, res) {
  if (res && res.ok && res.type === 'basic' && !res.redirected) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}

// 'no-cache' revalidates against the server instead of trusting the HTTP cache,
// which on GitHub Pages holds every file for ten minutes and would quietly turn
// "network first" into "ten minutes stale first". It still sends the validator,
// so an unchanged 230KB game page costs a 304 and not a re-download.
async function networkFirst(req, budget) {
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then(unredirect)
    .then(res => store(req, res));
  // Being offline is the easy case: fetch rejects at once. The dangerous case is
  // a connection that is present but dead, where fetch has no timeout of its own
  // and the app — fullscreen, no URL bar, no stop button — would sit on a blank
  // screen. So race a timer, but only give up on the network if the cache can
  // actually answer; and never abort the request, so its result still lands in
  // the cache for next time.
  let timer;
  const slow = new Promise(r => { timer = setTimeout(() => r('slow'), budget); });
  try {
    const first = await Promise.race([net.then(res => ({ res })), slow]);
    if (first !== 'slow') {
      if (first.res && first.res.ok) return first.res;
      const stale = await caches.match(req, { ignoreSearch: true });
      if (stale) return stale;
      // A game listed in games.json whose page is missing or not published yet
      // would otherwise draw the host's own 404 — in English, inside an Arabic
      // shelf, with nothing saying which name was wrong.
      if (req.destination === 'iframe') return notFound(fileName(req.url));
      return first.res;
    }
  } catch (err) {
    /* offline, or the server refused */
  } finally {
    clearTimeout(timer);
  }
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  // Nothing cached, so waiting a little longer still beats a blank error — but
  // bounded. Offline rejects at once; a connection that accepts the request and
  // then never answers would otherwise hang here forever, which is the exact
  // failure the first timer exists to prevent, one step further down.
  try {
    let t2;
    const grace = new Promise(r => { t2 = setTimeout(() => r('slow'), NET_TIMEOUT); });
    const second = await Promise.race([net.then(res => ({ res })), grace]);
    clearTimeout(t2);
    if (second !== 'slow' && second.res) return second.res;
  } catch (err) { /* really offline */ }

  // A top level page must never end up with an error page: fullscreen means no
  // URL bar and no reload button, so the only way out would be force quitting.
  if (req.destination === 'document') {
    return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
  }
  // An iframe is a navigation too, but answering one with the shelf would draw
  // the launcher inside the player, with tiles that open another launcher
  // inside that. Say what actually happened instead.
  if (req.destination === 'iframe') return notSaved();
  return Response.error();
}

function page(lines) {
  return new Response(
    '<!DOCTYPE html><html lang="ar" dir="rtl"><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:14px;background:#14171c;color:#e7ecf3;' +
    'font:15px/1.6 system-ui,sans-serif;text-align:center;padding:24px}' +
    'p{margin:0;max-width:22em}small{color:#8a94a3}' +
    'button{font:inherit;padding:9px 18px;border-radius:9px;border:1px solid #2c333d;' +
    'background:#1b1f26;color:inherit}code{color:#e7ecf3;background:#1b1f26;' +
    'padding:2px 6px;border-radius:5px;direction:ltr;display:inline-block}</style>' +
    lines +
    '<button onclick="location.reload()">إعادة المحاولة</button>',
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

function notSaved() {
  return page('<p>هذه اللعبة لم تُحفظ للعمل بدون إنترنت بعد.</p>' +
              '<small>افتحها مرة واحدة والاتصال متاح، ثم ستعمل بدونه.</small>');
}

function fileName(u) {
  try { return new URL(u).pathname.split('/').pop() || ''; } catch (e) { return ''; }
}

function notFound(name) {
  const safe = String(name || '').replace(/[&<>"]/g, '');
  return page('<p>لم يُعثر على صفحة هذه اللعبة.</p>' +
              '<small>تأكّد أن الملف <code>' + safe + '</code> موجود في المستودع وأن اسمه ' +
              'مطابق لما في <code>games.json</code>. وإن كنت قد رفعته للتو فقد يحتاج دقائق للنشر.</small>');
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) {
    // A ten minute old icon is nobody's problem, so this leg stays a plain
    // fetch: forcing revalidation here would add a conditional request per icon
    // to every launch and change nothing anyone can see.
    fetch(req).then(res => store(req, res)).catch(() => {});
    return hit;
  }
  try {
    return store(req, await fetch(req));
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  // Cross origin (the web font) is left entirely alone, so a font that fails can
  // never be answered out of this cache, let alone with HTML.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/games.json')) return e.respondWith(networkFirst(req, REGISTRY_TIMEOUT));
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  e.respondWith(isPage ? networkFirst(req, NET_TIMEOUT) : cacheFirst(req));
});
"""

ASSETS_JSON = json.dumps(CACHED)
# hash the worker's own logic and its asset list, so BUILD moves when behaviour
# moves and stays put when only a game changes
BUILD = hashlib.sha256((SW_BODY + ASSETS_JSON).encode()).hexdigest()[:12]
emit(os.path.join(REPO, 'sw.js'), SW_BODY % {'build': BUILD, 'assets': ASSETS_JSON})


# ---------- 5. write, or just report
os.makedirs(BUILD_DIR, exist_ok=True)

stale = []
for path, data in sorted(WRITTEN.items()):
    old = open(path, 'rb').read() if os.path.exists(path) else None
    if old != data:
        stale.append(path)
    if not CHECK:
        open(path, 'wb').write(data)

rel = lambda p: os.path.relpath(p, REPO)
if CHECK:
    if stale:
        print('out of date, run without --check:')
        for p in stale:
            print('  ' + rel(p))
        raise SystemExit(1)
    print('up to date: every published file matches the sources')
else:
    print('built ' + BUILD)
    for path in sorted(WRITTEN):
        mark = '*' if path in stale else ' '
        print(f'{mark} {rel(path):28} {len(WRITTEN[path])/1024:7.1f} KB')
    print(f'  games.json (input)         {os.path.getsize(os.path.join(REPO, "games.json"))/1024:7.1f} KB')
    if stale:
        print(f'{len(stale)} file(s) changed, marked *')
