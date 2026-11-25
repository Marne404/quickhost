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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(PREFIX)) return;
  event.respondWith(serve(url));
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
