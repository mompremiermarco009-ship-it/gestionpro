const CACHE_NAME = 'gestionpro-v9'; // Version très élevée
const ASSETS = [
  '/',
  '/index.html',
  '/auth.html',
  '/dashboard.html',
  '/admin.html',
  '/style.css',
  '/app.js',
  '/auth.js',
  '/admin.js',
  '/supabase-client.js',
  '/site.webmanifest',
  '/android-chrome-192x192.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const resClone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
