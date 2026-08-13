# -*- coding: utf-8 -*-
"""inscription.html = inscription.dc.html + le bloc de boot, et RIEN d'autre.
   Même discipline que index.html / back_office_ws_franchisee.dc.html : une
   seule source de contenu, la page servie n'en est que la version bootée."""
import io, os, re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC = os.path.join(RACINE, 'inscription.dc.html')
DST = os.path.join(RACINE, 'inscription.html')
V = '?v=2026081301'

BOOT = u'''<title>Créer mon compte — L'Atelier By</title>
<script>window.__resources={"https://unpkg.com/react@18.3.1/umd/react.production.min.js":"vendor/react.js","https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js":"vendor/react-dom.js"};</script>
<script>
/* =====================================================================
   Boot de la page « Créer mon compte » (lien d'invitation du personnel)
   =====================================================================
   La page s'ouvre depuis un lien reçu par e-mail : <url>?i=<jeton signé>.

   RÈGLE : le jeton n'est PAS lu ici. Il est signé par le serveur, et ce
   qu'il porte — boutique, bureau, site, domaine e-mail — décide de qui
   facture et à quelles conditions. Le décoder dans le navigateur
   reviendrait à croire une valeur que n'importe qui peut réécrire. On le
   renvoie tel quel au serveur, qui répond ce que la page a le droit
   d'afficher.

   window.__INVITE est posé AVANT le runtime, dans tous les cas : en
   succès, en refus, en panne réseau. Une page servie ne peut donc jamais
   retomber sur les valeurs de prévisualisation de l'éditeur.
   ===================================================================== */
(function () {
  var q = null; try { q = new URLSearchParams(location.search); } catch (e) {}
  var jeton = (q && q.get('i')) || '';

  // Même convention que la console : la page vit sous .../webshop/…,
  // l'API partagée est à .../webshop/api.
  var path = location.pathname;
  var m = path.match(/^(.*?)\\/backoffice_franchisee(?:\\/|$)/);
  var webshopBase = m ? m[1] : path.replace(/[^/]*$/, '').replace(/\\/$/, '');
  var api = (q && q.get('api')) || (location.origin + webshopBase + '/api');

  function boot() {
    var s = document.createElement('script'); s.src = './support.js__V__'; document.head.appendChild(s);
  }
  function pose(v) { window.__INVITE = v; boot(); }
  // L'identité affichable que le serveur a bien voulu servir — et elle seule.
  function identite(j, etat) {
    return { ok: true, etat: etat, api: api, jeton: jeton,
      boutique: j.boutique || '', raison: j.raison || '', site: j.site || '',
      departements: Array.isArray(j.departements) ? j.departements : [],
      domaine: j.domaine || '', cp: j.cp || '', logo: j.logo || '',
      expireLe: j.expire_le || '' };
  }

  if (!jeton) {
    pose({ ok: false, motif: 'Cette page s’ouvre depuis le lien d’invitation reçu par e-mail. '
      + 'L’adresse utilisée ne contient aucune invitation — rouvrez le lien tel qu’il vous a été envoyé.' });
    return;
  }

  var fini = false;
  var to = setTimeout(function () {
    if (fini) return; fini = true;
    pose({ ok: false, motif: 'Le serveur n’a pas répondu. Rechargez la page dans un instant.' });
  }, 8000);

  fetch(api + '/webshop/invite?i=' + encodeURIComponent(jeton), { credentials: 'omit' })
    .then(function (r) {
      return r.json().then(function (j) { return { st: r.status, ok: r.ok, j: j }; },
                           function ()  { return { st: r.status, ok: false, j: null }; });
    })
    .then(function (res) {
      if (fini) return; fini = true; clearTimeout(to);
      var j = res.j || {};
      if (res.ok && j.ok !== false) { pose(identite(j, j.etat || 'valide')); return; }
      // Lien expiré ou révoqué : ce n'est pas une panne, l'écran le dit avec
      // ses mots — et garde l'identité du bureau si le serveur l'a servie.
      if (res.st === 410 || j.etat === 'expire' || j.etat === 'revoque') {
        pose(identite(j, j.etat === 'revoque' ? 'revoque' : 'expire')); return;
      }
      pose({ ok: false, motif: (res.st === 404 || res.st === 400)
        ? 'Ce lien d’invitation est inconnu du serveur. Demandez-en un nouveau à votre responsable.'
        : ('Le serveur a refusé de lire cette invitation (HTTP ' + res.st + ').') });
    })
    .catch(function (e) {
      if (fini) return; fini = true; clearTimeout(to);
      pose({ ok: false, motif: 'Serveur injoignable — ' + ((e && e.message) || 'erreur réseau')
        + '. Réessayez dans un instant.' });
    });
})();
</script>
'''.replace('__V__', V)

s = io.open(SRC, encoding='utf-8').read()

# La page servie charge support.js elle-même, après avoir posé __INVITE.
s = s.replace('<script src="./support.js"></script>\n', '')
# Versionner les assets, comme index.html.
s = s.replace('_ds_bundle.js"', '_ds_bundle.js' + V + '"').replace('global.css"', 'global.css' + V + '"')
s = s.replace('<meta name="viewport" content="width=device-width, initial-scale=1">\n',
              '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + BOOT)

io.open(DST + '.tmp', 'w', encoding='utf-8').write(s)
os.replace(DST + '.tmp', DST)
print('écrit', DST, len(s))
