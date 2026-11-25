const SCOPE = self.registration.scope; // z.B. https://user.github.io/repo/
const PREFIX = new URL('p/', SCOPE).pathname; // /repo/p/

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('quickhost', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('files');
      r.result.createObjectStore('sites');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function getFile(db, key) {
  return new Promise((res, rej) => {
    const q = db.transaction('files').objectStore('files').get(key);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

// Die Upload-Seite selbst, damit sie auch offline läuft
const CACHE = 'quickhost-shell-v1';
const SHELL = ['./', 'index.html', 'jszip.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']
  .map(p => new URL(p, SCOPE).href);

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
));
self.addEventListener('activate', e => e.waitUntil((async () => {
  // Nur eigene alte Caches löschen: der Cache-Speicher gilt für die ganze Origin
  for (const key of await caches.keys()) {
    if (key.startsWith('quickhost-') && key !== CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));

// Erst Netzwerk (damit Updates ankommen), offline aus dem Cache
async function shell(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== 'GET') return;
  if (url.pathname.startsWith(PREFIX)) return event.respondWith(serve(url));
  const key = url.origin + url.pathname;
  if (SHELL.includes(key)) event.respondWith(shell(event.request, key));
});

async function serve(url) {
  const rest = decodeURIComponent(url.pathname.slice(PREFIX.length)); // "<id>/pfad"
  const slash = rest.indexOf('/');
  const id = slash === -1 ? rest : rest.slice(0, slash);

  // /p/<id> ohne Slash -> Redirect, damit relative Pfade funktionieren
  if (slash === -1) {
    return Response.redirect(url.pathname + '/', 301);
  }

  let path = rest.slice(slash + 1);
  if (path === '' || path.endsWith('/')) path += 'index.html';

  const db = await openDB();
  let blob = await getFile(db, id + '/' + path);

  // Ordner ohne Slash, z.B. /p/id/sub -> sub/index.html
  if (!blob) blob = await getFile(db, id + '/' + path + '/index.html');

  if (!blob) return new Response('404 – Datei nicht gefunden: ' + path, { status: 404 });

  return new Response(blob, {
    headers: { 'Content-Type': blob.type || 'application/octet-stream' }
  });
}
