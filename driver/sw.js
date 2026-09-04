/* Service worker — la tournée doit rester lisible dans un sous-sol sans réseau.
   Deux règles, et deux seulement :
   • la COQUE (html, css, js, polices, logo) est servie depuis le cache, puis
     rafraîchie en arrière-plan ;
   • les appels API ne sont JAMAIS servis depuis le cache. Une donnée de tournée
     périmée présentée comme fraîche est pire que pas de donnée : l'application
     affiche l'échec réseau et ce qu'elle avait en mémoire, en le disant. */
var CACHE = 'drv-shell-v4';   // v4 : caméra HD + mise au point, lampe, viseur agrandi
var SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'api.js', 'manifest.webmanifest',
  'vendor/jsqr.js',
  'icon-192.png', 'icon-512.png', 'img/logo.png',
  '_ds/l-atelier-by-8504a4e3-7796-44da-b087-3fbd9dcb8dcd/global.css'
];

self.addEventListener('install', function (e) {
  // addAll échoue en bloc si UN fichier manque : on ajoute un par un pour que
  // l'absence d'une police n'empêche pas l'installation de la coque.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;                       // écritures : jamais interceptées
  var u = new URL(r.url);
  if (u.origin !== location.origin) return;             // tuiles, cartes : au réseau
  if (u.pathname.indexOf('/api/') >= 0) return;         // API : au réseau, toujours
  e.respondWith(
    caches.match(r).then(function (hit) {
      var net = fetch(r).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, copy); }); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
