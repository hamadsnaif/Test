// Offline cache for Hamad's Games, and the path new versions travel down.
//
// BUILD is a version of this worker's *behaviour*, not of the site's content —
// it is a hash of the code below plus the list of files it keeps offline. It
// deliberately does not change when a game or games.json changes, because those
// are read from the network first and need no new worker to arrive. Editing a
// game therefore costs nobody a re-download of the other 400KB.
const BUILD = '08a6eb45abbe';
const CACHE = 'hamads-games';
const ASSETS = ["./", "./apple-touch-icon.png", "./bounce.html", "./games.json", "./icon-120.png", "./icon-152.png", "./icon-167.png", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./index.html", "./manifest.webmanifest", "./snake.html", "./tetris.html"];
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
