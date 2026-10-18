const CACHE_NAME = 'gestionpro-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './supabase-client.js',
  './manifest.json'
];

// Installation : on met en cache les fichiers de base
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activation : on supprime les anciens caches si on change la version
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Interception : on sert le cache si on est hors ligne, sinon on va sur internet
self.addEventListener('fetch', (e) => {
  // On ne met pas en cache les requêtes vers Supabase (les données doivent être fraîches)
  if (e.request.url.includes('supabase.co')) return;
  
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});
