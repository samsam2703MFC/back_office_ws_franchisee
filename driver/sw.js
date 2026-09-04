/* Service worker — la tournée doit rester lisible dans un sous-sol sans réseau.
   Deux règles, et deux seulement :
   • la COQUE (html, css, js, polices, logo) est servie depuis le cache, puis
     rafraîchie en arrière-plan ;
   • les appels API ne sont JAMAIS servis depuis le cache. Une donnée de tournée
     périmée présentée comme fraîche est pire que pas de donnée : l'application
     affiche l'échec réseau et ce qu'elle avait en mémoire, en le disant. */
var CACHE = 'drv-shell-v7';   // v7 : icône maskable avec le camion
var SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'api.js', 'manifest.webmanifest',
  'vendor/jsqr.js',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'img/logo.png',
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

// La page demande à la nouvelle version de prendre la main sans attendre.
self.addEventListener('message', function (e) { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;                       // écritures : jamais interceptées
  var u = new URL(r.url);
  if (u.origin !== location.origin) return;             // tuiles, cartes : au réseau
  if (u.pathname.indexOf('/api/') >= 0) return;         // API : au réseau, toujours

  /* LE CODE DE L'APPLICATION : RÉSEAU D'ABORD, cache en secours.
     Le « cache d'abord » a coûté cher : le téléphone continuait de tourner une
     version corrigée la veille, on croyait tester la nouvelle, et on cherchait
     des bugs déjà réparés. Une coque vieille d'un jour est pire qu'un
     chargement un peu plus lent. Hors réseau, le cache prend le relais — c'est
     à ça qu'il sert.
     Le RESTE (polices, logo, décodeur QR) ne bouge jamais : cache d'abord. */
  var shell = /\.(html|js|css|webmanifest)$/.test(u.pathname)
           || /\/(driver\/)?$/.test(u.pathname);
  if (shell) {
    e.respondWith(
      fetch(r).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, copy); }); }
        return res;
      }).catch(function () {
        // Hors réseau : la coque en cache. Pour une NAVIGATION, on rend la
        // page d'accueil du cache — sinon le chauffeur tombe sur l'écran
        // « pas d'internet » du navigateur au lieu de sa tournée.
        return caches.match(r).then(function (hit) {
          if (hit) return hit;
          if (r.mode === 'navigate') return caches.match('index.html').then(function (h2) { return h2 || caches.match('./'); });
          return undefined;
        });
      })
    );
    return;
  }
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
