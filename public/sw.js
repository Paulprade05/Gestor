/* Service worker de Hucha: app shell offline + sincronización en segundo plano. */
// Subir al publicar cambios en public/ (iconos, manifest): limpia la caché anterior.
const VERSION = 'hucha-v5';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.svg',
];

// Además del shell, se precachean los JS/CSS con hash que referencia index.html: en la primera visita
// la página ya los ha descargado antes de que el SW tome el control, y sin esto no habría modo offline.
async function precachear() {
  const cache = await caches.open(VERSION);
  await cache.addAll(PRECACHE);
  const html = await (await cache.match('/index.html')).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await cache.addAll(assets);
}

self.addEventListener('install', (e) => {
  e.waitUntil(precachear().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegación: red primero (para recibir versiones nuevas), caché si no hay conexión.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copia));
          return r;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Recursos estáticos: caché primero y actualización en segundo plano (stale-while-revalidate).
  // Los ficheros de /assets/ llevan hash en el nombre, así que la versión cacheada nunca queda obsoleta.
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cacheada = await cache.match(request);
      const red = fetch(request)
        .then((r) => {
          if (r.ok) cache.put(request, r.clone());
          return r;
        })
        .catch(() => cacheada);
      return cacheada || red;
    }),
  );
});

// ─── Background Sync (Chrome/Android; Safari no lo implementa y la página sincroniza al volver online) ──

const abrirDB = () =>
  new Promise((ok, ko) => {
    const r = indexedDB.open('hucha');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });

const leer = (db, store, clave) =>
  new Promise((ok, ko) => {
    const s = db.transaction(store).objectStore(store);
    const r = clave === undefined ? s.getAll() : s.get(clave);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });

async function sincronizar() {
  const db = await abrirDB();
  const ajustes = await leer(db, 'kv', 'ajustes');
  const url = ajustes && ajustes.urlSincronizacion;
  if (!url) return;
  const cambios = await leer(db, 'outbox');
  if (!cambios.length) return;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cambios }) });
  if (!r.ok) throw new Error('sync ' + r.status); // el navegador reintentará
  await new Promise((ok, ko) => {
    const t = db.transaction(['outbox', 'kv'], 'readwrite');
    cambios.forEach((c) => t.objectStore('outbox').delete(c.id));
    t.objectStore('kv').put({ ...ajustes, ultimaSincronizacion: new Date().toISOString() }, 'ajustes');
    t.oncomplete = ok;
    t.onerror = () => ko(t.error);
  });
}

self.addEventListener('sync', (e) => {
  if (e.tag === 'hucha-sync') e.waitUntil(sincronizar());
});
