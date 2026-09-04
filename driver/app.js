/* =====================================================================
   app.js — PWA chauffeur L'Atelier By  (/webshop/driver)
   =====================================================================
   Parcours : prendre sa tournée → valider le chargement (QR colis) →
   feuille de route → navigation → remise sur place + SMS → retour dépôt →
   fin de journée.

   RÈGLES DE CE DÉPÔT, APPLIQUÉES ICI :
   • aucune donnée inventée : ce que l'API ne sert pas reste vide, et
     l'écran le dit. Pas de tournée d'exemple, pas d'arrêt de démonstration ;
   • ce qui est écrit au serveur et ce qui reste sur le téléphone sont
     DISTINGUÉS À L'ÉCRAN. Aujourd'hui le serveur reçoit la prise de tournée
     (tour-dispatch) et la position (driver-position) ; les scans, la note et
     les étoiles n'ont pas encore d'endpoint et restent locaux — l'application
     le dit au lieu de laisser croire que le dépôt les voit.
   ===================================================================== */
(function () {
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');

  /* ── état ─────────────────────────────────────────────────────────── */
  var S = {
    screen: 'boot', err: null, busy: false, notice: null,
    shops: [], shopId: '', pin: '',
    me: null, tours: [], tree: [], dispatch: [],
    tourId: null, stopIx: 0,
    scanOn: false, scanMsg: '', lastScan: '',
    manual: '', posState: 'off', posMsg: ''
  };

  var LS_TPL = 'drv_sms_tpl';
  var DEFAULT_TPL = 'Bonjour {prenom} ! Ta commande est là : bon appétit !';
  // Icône appareil photo — tracé du DS, pas d'emoji : l'emoji change d'un
  // téléphone à l'autre et jure avec la charte.
  var CAM = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="vertical-align:-2px"><path d="M3 8h3.5L8 5.5h8L17.5 8H21v12H3z"/><circle cx="12" cy="13.5" r="3.6"/></svg>';

  /* Le nom qui part au dépôt : celui de la session PIN, ou celui saisi en
     mode test. Jamais deviné — sans nom, la tournée s'afficherait au dépôt
     sans savoir qui roule. */
  function driverName() { return (DRV.session() || {}).nom || DRV.driverName() || ''; }

  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(d) { d = d || new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function toast(m) { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.hidden = true; }, 3000); }

  /* ── état local du jour (téléphone) ───────────────────────────────── */
  function dayKey() { return 'drv_day_' + today(); }
  var DAY = null;
  function day() {
    if (DAY) return DAY;
    try { DAY = JSON.parse(localStorage.getItem(dayKey()) || 'null'); } catch (e) { DAY = null; }
    if (!DAY || DAY.date !== today()) DAY = { date: today(), tours: {}, rating: 0, tags: [], note: '', closedAt: null };
    return DAY;
  }
  function saveDay() { try { localStorage.setItem(dayKey(), JSON.stringify(day())); } catch (e) {} }
  function tourLocal(id) {
    var d = day(); id = String(id);
    if (!d.tours[id]) d.tours[id] = { loaded: {}, delivered: {}, arrived: {}, sms: {}, phones: {}, done: {},
                                      vehicle: '', km0: '', km1: '', note: '', rating: 0, tags: [], takenAt: null, serverTake: null, closedAt: null };
    return d.tours[id];
  }

  /* ── lecture API ──────────────────────────────────────────────────── */
  function numId(rid) { return parseInt(String(rid).replace(/^r/, ''), 10); }

  function loadAll() {
    S.busy = true; render();
    var jobs = [
      DRV.get('/franchisee/me').then(function (j) { S.me = (j && j.shop) || null; }, err),
      DRV.get('/franchisee/ws-tours').then(function (j) { S.tours = Array.isArray(j) ? j : []; }, err),
      DRV.get('/franchisee/fr-tdb-tree').then(function (j) { S.tree = Array.isArray(j) ? j : []; }, err),
      DRV.get('/franchisee/tour-dispatch-status').then(function (j) { S.dispatch = Array.isArray(j) ? j : []; }, err)
    ];
    var fails = [], sections = [];
    function err(e) {
      if (e.status === 401 && DRV.isAdmin()) fails.push('Jeton admin refusé (401) — vérifie le ?token= de l\'adresse.');
      else if (e.status === 401) { S.screen = 'login'; }
      else {
        // 403 « section … non autorisée » : c'est un RÉGLAGE DE PROFIL, pas
        // une panne. On retient la section pour dire quoi faire, au lieu de
        // répéter trois fois le même refus.
        var m = /section «\s*([a-zA-Z]+)\s*»/.exec(e.message || '');
        if (e.status === 403 && m) { if (sections.indexOf(m[1]) < 0) sections.push(m[1]); }
        else fails.push(e.message);
      }
    }
    return Promise.all(jobs).then(function () {
      S.busy = false;
      S.sections = sections;
      if (sections.length) fails.unshift('Ce compte n\'a pas les sections ' + sections.join(', ') + '.');
      S.err = fails.length ? fails.join(' · ') : null;
      if (S.screen === 'boot' || S.screen === 'login') S.screen = (DRV.session() || DRV.isAdmin()) ? 'pick' : 'login';
      render();
    });
  }

  /* Jour de la semaine dans le format de ws-tours (L/Ma/Me/J/V/S/D). */
  function todayKeyFR() { return ['D', 'L', 'Ma', 'Me', 'J', 'V', 'S'][new Date().getDay()]; }

  /* Les tournées du jour : actives, et qui roulent aujourd'hui quand des
     jours sont paramétrés. Une tournée sans jours paramétrés n'est PAS
     masquée — l'absence de paramétrage n'est pas une absence de tournée. */
  function toursToday() {
    var k = todayKeyFR();
    return S.tours.filter(function (t) {
      if (t.active === false) return false;
      var d = t.days || {};
      var any = Object.keys(d).some(function (x) { return d[x]; });
      return !any || !!d[k];
    });
  }

  function dispatchOf(name) { return S.dispatch.find(function (r) { return r.tour === name; }) || null; }

  /* Contenu d'une tournée : arrêts (sites) et colis (commandes du jour).
     Le tri suit l'arbre servi par le dépôt — c'est le sens de livraison. */
  function stopsOf(tourName) {
    var e = S.tree.find(function (x) { return x.nom === tourName; });
    if (!e) return [];
    var out = [];
    (e.zones || []).forEach(function (z) {
      (z.sites || []).forEach(function (s, i) {
        var orders = (s.users || []).map(function (u) {
          var nom = String(u.nom || '');
          // « Client · #REF » aujourd'hui ; « … · Jeu 05/09 » = jour à venir.
          var m = nom.match(/^(.*?)\s*·\s*#([^\s·]+)(?:\s*·\s*(.+))?$/);
          return { client: m ? m[1] : nom, ref: m ? m[2] : nom, later: m ? (m[3] || '') : '', pieces: u.cmd || 0 };
        }).filter(function (o) { return !o.later; });   // aujourd'hui seulement
        if (!orders.length) return;
        out.push({ key: (z.nom || '') + '|' + (s.libelle || '') + '|' + i, zone: z.nom || '—',
                   libelle: s.libelle || '—', adresse: s.ville || '', office: s.office || '—', orders: orders });
      });
    });
    return out;
  }

  function tourById(id) {
    return S.tours.find(function (t) { return numId(t.id) === Number(id); }) || null;
  }
  function tourStops(id) { var t = tourById(id); return t ? stopsOf(t.name) : []; }
  function allOrders(id) { return tourStops(id).reduce(function (a, s) { return a.concat(s.orders.map(function (o) { return { stop: s, o: o }; })); }, []); }

  /* ── écrans ───────────────────────────────────────────────────────── */
  function render() {
    var f = ({ boot: vBoot, login: vLogin, pick: vPick, load: vLoad, route: vRoute,
               drive: vDrive, stop: vStop, close: vClose, day: vDay, sync: vSync, noscope: vNoScope })[S.screen] || vBoot;
    app.innerHTML = f();
    var b = app.querySelector('[data-focus]'); if (b) b.focus();
    /* Le scanner vit sur TOUS les écrans qui portent un viseur (#vf) : prendre
       sa tournée, le chargement, la remise. Il n'était monté que sur deux
       d'entre eux — sur l'écran d'accueil, « Scanner » n'allumait donc RIEN. */
    if (S.scanOn && app.querySelector('#vf')) mountScanner();
    else stopScanner();
    if (S.screen === 'drive') startPos(); else stopPos();
  }

  function bar(opts) {
    return '<div class="sb"></div><div class="bar">'
      + (opts.back ? '<button class="back" data-act="' + opts.back + '">‹</button>' : '')
      + (opts.logo ? '<div><img class="logo" src="img/logo.png" alt="L\'Atelier">'
                     + '<div class="sub">' + esc(opts.sub || '') + '</div></div>'
                   : '<div><div class="ttl">' + esc(opts.ttl) + '</div><div class="sub">' + esc(opts.sub || '') + '</div></div>')
      + (opts.rt ? '<div class="rt">' + esc(opts.rt) + '<small>' + esc(opts.rtSub || '') + '</small></div>' : '')
      + '</div>';
  }
  function errBox() { return S.err ? '<div class="err">' + esc(S.err) + '</div>' : ''; }

  /* MODE TEST : dit à l'écran, tout le temps. Un jeton réseau posé sur un
     téléphone doit se voir — sinon il s'y installe et personne ne le sait. */
  function adminStrip() {
    if (!DRV.isAdmin()) return '';
    return '<div class="card warn" style="padding:9px 11px"><div class="p" style="color:var(--color-text);font-size:10.5px">'
      + '<b>Mode test — jeton admin réseau</b> sur ce téléphone, boutique ' + esc(DRV.adminShop() || '?')
      + '. À remplacer par un PIN chauffeur avant de le confier. <b data-act="goSync">Quitter →</b></div></div>';
  }

  function vNoScope() {
    return bar({ logo: 1, sub: 'Livraison — mode test' })
      + '<div class="body"><div class="h1">Portée boutique manquante</div>'
      + '<div class="card warn"><div class="p" style="color:var(--color-text)">Le jeton admin est <b>réseau</b> : sans <code>?shop=</code>, l\'API rend les tournées de <b>toutes</b> les boutiques. '
      + 'L\'application ne les affiche pas — ouvre-la avec l\'adresse complète :</div>'
      + '<div class="p" style="color:var(--color-text);margin-top:6px"><code>/webshop/driver/?shop=&lt;id&gt;&amp;token=&lt;jeton admin&gt;</code></div></div>'
      + '<input class="field" inputmode="numeric" placeholder="id de la boutique" data-act="shopnum">'
      + '</div><div class="foot"><button class="btn" data-act="setscope">Utiliser cette boutique</button>'
      + '<button class="btn gh sm" data-act="quitadmin">Oublier le jeton admin</button></div>';
  }

  function vBoot() {
    return bar({ logo: 1, sub: 'Livraison' })
      + '<div class="body"><div class="p">' + (S.busy ? 'Chargement…' : 'Démarrage…') + '</div>' + errBox() + '</div>';
  }

  /* 0 · CONNEXION — boutique + PIN (session bo_pin_session, 12 h). */
  function vLogin() {
    var dots = '';
    for (var i = 0; i < 4; i++) dots += '<i class="' + (i < S.pin.length ? 'on' : '') + '"></i>';
    var keys = '';
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function (n) { keys += '<button data-act="pin" data-n="' + n + '">' + n + '</button>'; });
    keys += '<button data-act="pinclr">C</button><button data-act="pin" data-n="0">0</button><button data-act="pindel">⌫</button>';
    var opts = S.shops.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (String(s.id) === String(S.shopId) ? ' selected' : '') + '>' + esc(s.name || ('Boutique ' + s.id)) + '</option>';
    }).join('');
    return bar({ logo: 1, sub: 'Livraison — connexion chauffeur' })
      + '<div class="body">'
      + '<div class="h1">Ton PIN</div>'
      + '<div class="p" style="margin-top:-4px">Le même compte que sur la tablette de la boutique. La session dure 12 h.</div>'
      + errBox()
      + '<div class="lbl">Boutique</div>'
      + (S.shops.length
          ? '<select class="field" data-act="shop">' + '<option value="">— choisir —</option>' + opts + '</select>'
          : '<input class="field" inputmode="numeric" placeholder="id de la boutique" value="' + esc(S.shopId) + '" data-act="shopnum">')
      + '<div class="dots">' + dots + '</div>'
      + '<div class="p" style="font-size:10.5px">Pas encore de compte chauffeur ? Ouvre l\'app avec <code>?shop=&lt;id&gt;&amp;token=&lt;jeton admin&gt;</code> — mode test, annoncé à l\'écran.</div>'
      + '<div class="pad">' + keys + '</div>'
      + '</div>'
      + '<div class="foot"><button class="btn" data-act="dologin"' + (S.shopId && S.pin.length === 4 && !S.busy ? '' : ' disabled') + '>'
      + (S.busy ? 'Connexion…' : 'Se connecter') + '</button></div>';
  }

  /* 1 · PRENDRE SA TOURNÉE — scan du bon (ERP) ou liste de ses tournées. */
  function vPick() {
    var ts = toursToday();
    var d = day();
    var sel = S.tourId ? tourById(S.tourId) : null;
    var loc = S.tourId ? tourLocal(S.tourId) : null;
    var vehicles = [];
    ts.forEach(function (t) { if (t.vehicule && vehicles.indexOf(t.vehicule) < 0) vehicles.push(t.vehicule); });
    var list = ts.map(function (t) {
      var id = numId(t.id), st = stopsOf(t.name), colis = st.reduce(function (a, s) { return a + s.orders.length; }, 0);
      var dp = dispatchOf(t.name);
      var mine = d.tours[String(id)] && d.tours[String(id)].takenAt;
      var taken = dp && dp.chauffeur && dp.chauffeur !== '—';
      var closed = d.tours[String(id)] && d.tours[String(id)].closedAt;
      var pill = closed ? '<span class="pill ok">terminée</span>'
        : mine ? '<span class="pill ruby">en cours</span>'
        : taken ? '<span class="pill grey">' + esc(dp.chauffeur) + '</span>'
        : '<span class="pill wait">libre</span>';
      return '<button class="stop" data-act="seltour" data-id="' + id + '">'
        + '<span class="num tag' + (String(id) === String(S.tourId) ? ' now' : '') + '">' + esc(t.short || '·') + '</span>'
        + '<span class="grow"><span class="pin" style="font-weight:600;display:block">' + esc(t.name) + (t.start != null ? ' · départ ' + pad(Math.floor(t.start / 60)) + ':' + pad(t.start % 60) : '') + '</span>'
        + '<span class="p" style="font-size:10.5px;display:block">' + st.length + ' arrêt(s) · ' + colis + ' colis'
        + (t.zone && t.zone !== '—' ? ' · ' + esc(t.zone) : '') + '</span></span>' + pill + '</button>';
    }).join('<div class="sep" style="margin:0"></div>');

    return bar({ logo: 1, sub: (S.me ? S.me.name + ' · ' : '') + frDate(), rt: (DRV.session() || {}).nom || '', rtSub: 'PIN' })
      + '<div class="body">'
      + adminStrip()
      + '<div class="h1">Scanne ton bon de livraison</div>'
      + errBox()
      + (DRV.isAdmin()
          ? '<div class="lbl">Chauffeur</div><input class="field" placeholder="ton nom (part au dépôt)" value="' + esc(DRV.driverName()) + '" data-act="drvname">'
          : '')
      + '<div class="scan"><div class="vf" id="vf" data-act="focus">' + corners()
        + '<div class="hint">' + esc(S.scanMsg || 'Le QR du bon de livraison (ERP) — 1 bon = 1 tournée') + '</div></div>'
        + '<div class="lg">' + (S.scanOn ? 'Scan — ' + scanMoteur() : 'Appuie sur « Scanner »') + scanTools() + '</div></div>'
      + '<button class="btn gh sm" data-act="scanon">' + (S.scanOn ? 'Arrêter le scan' : CAM + ' Scanner le bon') + '</button>'
      + '<div class="card"><div class="row"><div class="h3">Tes tournées du jour</div><span class="pill ruby" style="margin-left:auto">' + ts.length + '</span></div>'
      + (ts.length ? '<div class="sep"></div>' + list
                     + '<div class="p" style="font-size:10.5px;margin-top:9px">Le QR ne passe pas ? Appuie simplement sur ta tournée ci-dessus.</div>'
                   : '<div class="p" style="margin-top:6px">Aucune tournée servie pour aujourd\'hui. Rien n\'est inventé ici : si le dépôt en a préparé une, elle apparaîtra dès que le serveur la sert.</div>')
      + '</div>'
      /* Liste vide À CAUSE d'un refus de section : le scan aura beau marcher,
         il n'y aura jamais rien à reconnaître. On dit les deux sorties, sans
         quoi on cherche du côté de la caméra pendant une heure. */
      + ((!ts.length && (S.sections || []).length)
          ? '<div class="card warn"><div class="h3">Pourquoi c\'est vide</div>'
            + '<div class="p" style="color:var(--color-text);margin-top:6px">Le serveur refuse à ce compte les sections <b>'
            + esc((S.sections || []).join(', ')) + '</b>. Le scan, lui, fonctionne — il n\'a simplement aucune tournée à reconnaître.</div>'
            + '<div class="p" style="color:var(--color-text);margin-top:6px">Deux sorties : ajouter <b>tournees, tdb, prep</b> au profil de ce compte (console marque → profils), '
            + 'ou ouvrir l\'app en mode test avec <code>?shop=&lt;id&gt;&amp;token=&lt;jeton admin&gt;</code> — le QR est dans la console, écran Tournées.</div></div>'
          : '')
      + (sel ? '<div class="lbl">Véhicule</div><div class="row wrap" style="gap:7px">'
            + vehicles.map(function (v) { return '<button class="chip' + (loc.vehicle === v ? ' on' : '') + '" data-act="veh" data-v="' + esc(v) + '">' + esc(v) + '</button>'; }).join('')
            + '<button class="chip' + (loc.vehicle && vehicles.indexOf(loc.vehicle) < 0 ? ' on' : '') + '" data-act="vehother">＋ autre</button></div>'
            + '<div class="lbl">Kilométrage au départ</div>'
            + '<input class="field" inputmode="numeric" placeholder="km au compteur" value="' + esc(loc.km0) + '" data-act="km0">'
        : '')
      + '</div>'
      + '<div class="foot">'
      + '<button class="btn" data-act="take"' + (sel && driverName() ? '' : ' disabled') + '>'
      + (!sel ? 'Choisis une tournée' : !driverName() ? 'Écris ton nom d\'abord' : 'Prendre ' + esc(sel.name) + ' →') + '</button>'
      + '<button class="btn gh sm" data-act="goSync">Ce que le dépôt reçoit</button>'
      + '</div>';
  }
  function corners() { return '<span class="c c1"></span><span class="c c2"></span><span class="c c3"></span><span class="c c4"></span>'; }
  function frDate() {
    var J = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var M = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    var d = new Date(); return J[d.getDay()] + ' ' + d.getDate() + ' ' + M[d.getMonth()];
  }

  /* 2 · CHARGEMENT — un colis, un scan (ou une case, avec motif). */
  function vLoad() {
    var t = tourById(S.tourId), loc = tourLocal(S.tourId), stops = tourStops(S.tourId);
    var all = allOrders(S.tourId), done = all.filter(function (x) { return loc.loaded[x.o.ref]; }).length;
    var miss = all.filter(function (x) { return !loc.loaded[x.o.ref] && (loc.missing || {})[x.o.ref]; }).length;
    var reste = all.length - done - miss;
    var lastZone = '';
    var body = stops.map(function (s) {
      var pend = s.orders.filter(function (o) { return !loc.loaded[o.ref] && !(loc.missing || {})[o.ref]; });
      if (!pend.length) return '';
      var zh = (s.zone !== lastZone) ? ('<div class="zone">' + esc(s.zone) + ' <i></i></div>') : '<div class="sep"></div>';
      lastZone = s.zone;
      return zh
        + '<div class="pin" style="font-weight:600">' + esc(s.libelle) + '</div>'
        + '<div class="p" style="font-size:10.5px">' + esc(s.office) + ' · ' + (s.orders.length - pend.length) + ' sur ' + s.orders.length + ' colis</div>'
        + pend.map(function (o) {
            return '<div class="row" style="gap:9px;margin-top:8px">'
              + '<button class="box" data-act="loadone" data-ref="' + esc(o.ref) + '"></button>'
              + '<div class="grow"><div class="pin" style="font-weight:600">Colis ' + esc(o.ref) + '</div>'
              + '<div class="p" style="font-size:10.5px">' + esc(o.client) + ' · ' + o.pieces + ' pièce(s)</div></div></div>';
          }).join('');
    }).join('');
    return bar({ back: 'goPick', ttl: 'Chargement', sub: (t ? t.name : '') + ' · ' + all.length + ' colis', rt: done + '/' + all.length, rtSub: 'validés' })
      + '<div class="body">'
      + '<div class="bar-p"><i style="width:' + (all.length ? Math.round(done * 100 / all.length) : 0) + '%"></i></div>'
      + errBox()
      + '<div class="scan"><div class="vf" id="vf" data-act="focus">' + corners() + '<div class="hint">' + esc(S.scanMsg || 'Vise le QR de l\'étiquette') + '</div></div>'
      + '<div class="lg">' + (S.scanOn ? 'Scan — ' + scanMoteur() : 'Scanner à l\'arrêt') + scanTools() + '</div></div>'
      + '<div class="row" style="gap:8px"><button class="btn gh sm grow" data-act="scanon">' + (S.scanOn ? 'Arrêter' : CAM + ' Scanner') + '</button>'
      + '<button class="btn gh sm grow" data-act="manualref">Saisir un n°</button></div>'
      + '<div class="card"><div class="row"><div class="h3">Reste à valider</div><span class="pill ' + (reste ? 'wait' : 'ok') + '" style="margin-left:auto">' + reste + ' colis</span></div>'
      + (reste ? body : '<div class="p" style="margin-top:6px">Tout est chargé. Le compte y est : ' + done + ' colis sur ' + all.length
          + (miss ? ' — ' + miss + ' signalé(s) manquant(s), ils partent au dépôt.' : '') + '.</div>')
      + '</div>'
      + '<div class="card soft"><div class="p" style="color:var(--color-text);font-size:10.5px"><b>Aucun « tout cocher ».</b> Chaque colis passe par le scan ou par sa propre case : c\'est ce qui évite de partir sans un carton.</div></div>'
      + '</div>'
      + '<div class="foot"><button class="btn" data-act="loaddone"' + (reste ? ' disabled' : '') + '>'
      + (reste ? 'Terminer le chargement · ' + reste + ' restant(s)' : 'Terminer le chargement →') + '</button>'
      + '<button class="btn gh sm" data-act="missing">Signaler un colis manquant</button></div>';
  }

  /* 3 · FEUILLE DE ROUTE — l'ordre du dépôt, l'état de chaque arrêt. */
  function vRoute() {
    var t = tourById(S.tourId), loc = tourLocal(S.tourId), stops = tourStops(S.tourId);
    var doneN = stops.filter(function (s) { return loc.done[s.key]; }).length;
    var list = stops.map(function (s, i) {
      var isDone = !!loc.done[s.key], isNow = i === S.stopIx && !isDone;
      var rem = s.orders.filter(function (o) { return !(loc.delivered[s.key] || {})[o.ref]; }).length;
      return '<button class="stop" data-act="gostop" data-i="' + i + '">'
        + '<span class="num ' + (isDone ? 'done' : isNow ? 'now' : '') + '">' + (isDone ? '✓' : (i + 1)) + '</span>'
        + '<span class="grow"><span class="h3" style="display:block">' + esc(s.libelle) + '</span>'
        + '<span class="p" style="font-size:10.5px;display:block">' + esc(s.adresse || s.office) + ' · ' + s.orders.length + ' colis'
        + (isDone ? ' · livré' + ((loc.arrived[s.key]) ? ' ' + esc(loc.arrived[s.key]) : '') : (rem ? ' · ' + rem + ' à remettre' : '')) + '</span></span>'
        + (isDone ? '<span class="pill ok">✓</span>' : isNow ? '<span class="pill ruby">à livrer</span>' : '') + '</button>';
    }).join('<div class="sep" style="margin:0"></div>');
    return bar({ back: 'goPick', ttl: 'Feuille de route', sub: (t ? t.name : '') + ' · ' + stops.length + ' arrêts', rt: doneN + '/' + stops.length, rtSub: 'livrés' })
      + '<div class="body">' + errBox()
      + '<div class="card" style="padding:6px 13px">' + (stops.length ? list : '<div class="p" style="padding:10px 0">Aucun arrêt servi pour cette tournée aujourd\'hui.</div>') + '</div>'
      + '<div class="p">L\'ordre vient du dépôt. Le bon de livraison papier porte la même feuille de route : si le téléphone lâche, le bon suffit.</div>'
      + '</div>'
      + '<div class="foot">'
      + (doneN >= stops.length && stops.length
          ? '<button class="btn" data-act="goclose">Retour au dépôt →</button>'
          : '<button class="btn" data-act="godrive">Aller à l\'arrêt ' + (S.stopIx + 1) + ' →</button>')
      + '</div>';
  }

  /* 4 · EN ROUTE — l'itinéraire est délégué à Maps/Waze (pas de clé, pas de
     carte à maintenir), la position part au dépôt et c'est DIT. */
  function vDrive() {
    var stops = tourStops(S.tourId), s = stops[S.stopIx];
    if (!s) return vRoute();
    var t = tourById(S.tourId);
    var q = encodeURIComponent((s.adresse || '') + ' ' + (s.libelle || ''));
    return bar({ back: 'goroute', ttl: 'Arrêt ' + (S.stopIx + 1) + ' sur ' + stops.length, sub: (t ? t.name : '') + ' · en route' })
      + '<div class="body">' + errBox()
      + '<div class="card"><div class="row"><div class="h2">' + esc(s.libelle) + '</div></div>'
      + '<div class="p" style="margin-top:3px">' + esc(s.adresse || '— adresse non renseignée sur le site') + '</div>'
      + '<div class="row wrap" style="gap:5px;margin-top:8px"><span class="pill grey">' + s.orders.length + ' colis</span>'
      + '<span class="pill grey">' + esc(s.office) + '</span><span class="pill abr">' + esc(s.zone) + '</span></div></div>'
      + '<div class="row" style="gap:8px">'
      + '<a class="btn gh sm grow" href="https://www.google.com/maps/dir/?api=1&destination=' + q + '&travelmode=driving" target="_blank" rel="noopener">Google Maps</a>'
      + '<a class="btn gh sm grow" href="https://waze.com/ul?q=' + q + '&navigate=yes" target="_blank" rel="noopener">Waze</a>'
      + '</div>'
      + '<div class="card soft"><div class="row"><span class="pill ' + (S.posState === 'ok' ? 'ok' : S.posState === 'ko' ? 'wait' : 'grey') + '">position</span>'
      + '<div class="p grow" style="font-size:10.5px">' + esc(S.posMsg || 'Position non encore envoyée.') + '</div></div></div>'
      + '</div>'
      + '<div class="foot"><button class="btn" data-act="arrive">Je suis arrivé</button>'
      + '<div class="row" style="gap:8px"><button class="btn gh sm grow" data-act="inc" data-k="Accès fermé">Accès fermé</button>'
      + '<button class="btn gh sm grow" data-act="inc" data-k="Client absent">Client absent</button>'
      + '<button class="btn gh sm grow" data-act="inc" data-k="Retard">Retard</button></div></div>';
  }

  /* 5 · SUR PLACE — remise scannée colis par colis, puis SMS au client. */
  function vStop() {
    var stops = tourStops(S.tourId), s = stops[S.stopIx];
    if (!s) return vRoute();
    var loc = tourLocal(S.tourId), del = loc.delivered[s.key] || {};
    var done = s.orders.filter(function (o) { return del[o.ref]; }).length, reste = s.orders.length - done;
    var tpl = smsTpl(), phone = loc.phones[s.key] || '';
    var first = (s.orders[0] && String(s.orders[0].client).trim().split(/\s+/)[0]) || '';
    var msg = smsText(tpl, first, s);
    var rows = s.orders.map(function (o) {
      var ok = !!del[o.ref];
      return '<div class="row" style="gap:9px;margin-top:8px">'
        + '<button class="box' + (ok ? ' done' : '') + '" data-act="deliverone" data-ref="' + esc(o.ref) + '">' + (ok ? '✓' : '') + '</button>'
        + '<div class="grow"><div class="pin" style="font-weight:600">Colis ' + esc(o.ref) + ' · ' + o.pieces + ' pièce(s)</div>'
        + '<div class="p" style="font-size:10.5px">' + esc(o.client) + (ok ? ' · remis ' + esc(del[o.ref]) : '') + '</div></div>'
        + (ok ? '' : '<span class="pill grey">scanner</span>') + '</div>';
    }).join('');
    return bar({ back: 'goroute', ttl: 'Arrivé · ' + s.libelle, sub: hhmm() + ' · arrêt ' + (S.stopIx + 1) + ' sur ' + stops.length, rt: done + '/' + s.orders.length, rtSub: 'remis' })
      + '<div class="body">'
      + '<div class="bar-p"><i style="width:' + Math.round(done * 100 / Math.max(1, s.orders.length)) + '%"></i></div>' + errBox()
      + '<div class="scan" style="padding:10px"><div class="vf" style="height:160px" id="vf" data-act="focus">' + corners()
      + '<div class="hint">' + esc(S.scanMsg || 'Scanne chaque colis remis') + '</div></div>'
      + '<div class="lg">' + (S.scanOn ? 'Scan — ' + scanMoteur() : 'Scanner à la remise') + scanTools() + '</div></div>'
      + '<div class="row" style="gap:8px"><button class="btn gh sm grow" data-act="scanon">' + (S.scanOn ? 'Arrêter' : CAM + ' Scanner') + '</button>'
      + '<button class="btn gh sm grow" data-act="manualref">Saisir un n°</button></div>'
      + '<div class="card"><div class="row"><div class="h3">À remettre ici</div><span class="pill ' + (reste ? 'wait' : 'ok') + '" style="margin-left:auto">' + (reste ? reste + ' restant(s)' : 'complet') + '</span></div>'
      + '<div class="p" style="font-size:10.5px;margin-top:2px">' + esc(s.office) + '</div>' + rows
      + '<div class="p" style="font-size:10.5px;margin-top:9px">↳ QR abîmé ? Coche le colis — le motif est demandé.</div></div>'
      + '<div class="sms"><div class="row"><div class="h3">SMS d\'arrivée</div><span class="p" style="margin-left:auto;color:var(--color-on-abricot);font-weight:600;font-size:10.5px">'
      + (loc.sms[s.key] ? 'envoyé ' + esc(loc.sms[s.key]) : 'à envoyer') + '</span></div>'
      + '<div class="bub" style="margin-top:9px">' + esc(msg) + '</div>'
      + '<input class="field" style="margin-top:9px" inputmode="tel" placeholder="n° du contact sur place" value="' + esc(phone) + '" data-act="phone">'
      + '<div class="row" style="gap:8px;margin-top:9px">'
      + '<a class="btn sm grow" style="background:#fff;color:var(--color-primary)" href="' + smsHref(phone, msg) + '" data-act="smssent">Envoyer le SMS</a>'
      + '<button class="btn sm" style="width:110px;background:transparent;border:1.5px solid var(--color-on-abricot);color:var(--color-on-abricot)" data-act="smstpl">Modèle</button></div>'
      + '<div class="p" style="color:var(--color-on-abricot);margin-top:7px;font-size:10.5px">Le SMS part depuis ce téléphone (application Messages) : le dépôt ne le voit pas tant que l\'API n\'a pas d\'envoi.</div></div>'
      + '</div>'
      + '<div class="foot"><button class="btn" data-act="stopdone"' + (reste ? ' disabled' : '') + '>'
      + (reste ? 'Arrêt terminé · ' + reste + ' à scanner' : 'Arrêt terminé → suivant') + '</button></div>';
  }

  function smsTpl() { try { return localStorage.getItem(LS_TPL) || DEFAULT_TPL; } catch (e) { return DEFAULT_TPL; } }
  function smsText(tpl, prenom, s) {
    return String(tpl).replace(/\{prenom\}/g, prenom || '').replace(/\{bureau\}/g, (s && s.office) || '')
      .replace(/\{boutique\}/g, (S.me && S.me.name) || '').replace(/\s+/g, ' ').trim();
  }
  function smsHref(phone, msg) {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return 'sms:' + encodeURIComponent(phone || '') + (ios ? '&' : '?') + 'body=' + encodeURIComponent(msg);
  }

  /* 6 · RETOUR AU DÉPÔT — clôture d'UNE tournée. */
  function vClose() {
    var t = tourById(S.tourId), loc = tourLocal(S.tourId), stops = tourStops(S.tourId);
    var colis = allOrders(S.tourId).length;
    var remis = stops.reduce(function (a, s) { return a + Object.keys(loc.delivered[s.key] || {}).length; }, 0);
    var others = toursToday().filter(function (x) { var i = String(numId(x.id)); return i !== String(S.tourId) && !(day().tours[i] && day().tours[i].closedAt); });
    var km = (parseInt(loc.km1, 10) || 0) - (parseInt(loc.km0, 10) || 0);
    return bar({ back: 'goroute', ttl: 'Retour au dépôt', sub: (t ? t.name : ''), rt: stops.length + '/' + stops.length, rtSub: 'arrêts' })
      + '<div class="body">'
      + '<div class="row" style="gap:8px"><div class="kpi"><b>' + remis + '</b><span>colis remis</span></div>'
      + '<div class="kpi"><b>' + stops.length + '</b><span>arrêts</span></div>'
      + '<div class="kpi"><b>' + (km > 0 ? km : '—') + '</b><span>km</span></div>'
      + '<div class="kpi"><b>' + colis + '</b><span>colis chargés</span></div></div>'
      + (remis < colis ? '<div class="card warn"><div class="p" style="color:var(--color-text);font-size:11px"><b>' + (colis - remis) + ' colis non remis</b> — ils repartent au dépôt. Dis pourquoi dans la note.</div></div>' : '')
      + '<div class="card"><div class="h3">Kilométrage au retour</div>'
      + '<input class="field" style="margin-top:7px" inputmode="numeric" placeholder="km au compteur" value="' + esc(loc.km1) + '" data-act="km1"></div>'
      + '<div class="card"><div class="h3">Cette tournée</div>' + starRow(loc.rating, 'ratetour')
      + '<div class="row wrap" style="gap:6px;margin-top:9px">' + tagChips(loc.tags, 'tagtour') + '</div></div>'
      + '<div class="card"><div class="h3">Note du chauffeur</div>'
      + '<textarea class="field" style="margin-top:7px" placeholder="ce que le dépôt doit savoir" data-act="notetour">' + esc(loc.note) + '</textarea></div>'
      + '</div>'
      + '<div class="foot">'
      + (others.length
          ? '<button class="btn" data-act="closenext">Clôturer et prendre ' + esc(others[0].name) + ' →</button><button class="btn gh sm" data-act="closeday">Clôturer et m\'arrêter là</button>'
          : '<button class="btn" data-act="closeday">Clôturer la tournée</button>')
      + '<div class="p" style="text-align:center;font-size:10px">Note et étoiles restent sur ce téléphone tant que l\'API n\'a pas d\'endpoint de clôture.</div></div>';
  }

  function starRow(v, act) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += '<button class="star" data-act="' + act + '" data-v="' + i + '"><span class="' + (i <= v ? '' : 'off') + '">★</span></button>';
    return '<div class="row" style="margin-top:4px">' + s + '</div>';
  }
  var TAGS = ['Trafic', 'Attente client', 'Véhicule', 'Accès livraison', 'Colis manquant'];
  function tagChips(sel, act) {
    return TAGS.map(function (t) { return '<button class="chip' + (sel.indexOf(t) >= 0 ? ' on' : '') + '" data-act="' + act + '" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
  }

  /* 7 · FIN DE JOURNÉE — les étoiles de la journée, une seule fois. */
  function vDay() {
    var d = day();
    var ids = Object.keys(d.tours).filter(function (i) { return d.tours[i].closedAt; });
    var colis = 0, km = 0;
    var lignes = ids.map(function (i) {
      var l = d.tours[i], t = tourById(i);
      var n = tourStops(i).reduce(function (a, s) { return a + Object.keys(l.delivered[s.key] || {}).length; }, 0);
      colis += n; km += Math.max(0, (parseInt(l.km1, 10) || 0) - (parseInt(l.km0, 10) || 0));
      return '<div class="row" style="gap:9px"><span class="num done">✓</span><span class="grow">'
        + '<span class="pin" style="font-weight:600;display:block">' + esc(t ? t.name : ('Tournée ' + i)) + '</span>'
        + '<span class="p" style="font-size:10.5px;display:block">' + n + ' colis · clôturée ' + esc(l.closedAt) + ' · ' + '★'.repeat(l.rating || 0) + '</span></span></div>';
    }).join('<div class="sep"></div>');
    return bar({ ttl: 'Fin de journée', sub: ids.length + ' tournée(s)', rt: String(colis), rtSub: 'colis' })
      + '<div class="body">'
      + '<div class="row" style="gap:8px"><div class="kpi"><b>' + ids.length + '</b><span>tournées</span></div>'
      + '<div class="kpi"><b>' + colis + '</b><span>colis remis</span></div>'
      + '<div class="kpi"><b>' + (km || '—') + '</b><span>km</span></div></div>'
      + '<div class="card"><div class="h3">Ma journée</div>' + starRow(d.rating, 'rateday')
      + '<div class="row wrap" style="gap:6px;margin-top:9px">' + tagChips(d.tags, 'tagday') + '</div></div>'
      + '<div class="card"><div class="h3">Les tournées</div><div class="sep"></div>' + (lignes || '<div class="p">Aucune tournée clôturée.</div>') + '</div>'
      + '<div class="card"><div class="row"><div class="h3">Mot de fin</div><span class="pill grey" style="margin-left:auto">facultatif</span></div>'
      + '<textarea class="field" style="margin-top:7px" data-act="noteday">' + esc(d.note) + '</textarea></div>'
      + '</div>'
      + '<div class="foot"><button class="btn" data-act="endday">Terminer ma journée</button>'
      + '<button class="btn gh sm" data-act="goSync">Ce que le dépôt reçoit</button></div>';
  }

  /* ÉTAT DE SYNCHRO — la page qui dit la vérité : ce qui part au serveur,
     ce qui reste ici, et ce qui manque côté API pour que ça parte. */
  function vSync() {
    var loc = S.tourId ? tourLocal(S.tourId) : null;
    return bar({ back: 'goback', ttl: 'Ce que le dépôt reçoit', sub: 'sync' })
      + '<div class="body">'
      + '<div class="card"><div class="h3">Envoyé au serveur</div>'
      + '<div class="p" style="margin-top:6px">• <b>Prise de tournée</b> — POST /franchisee/tour-dispatch : ton nom apparaît sur la tournée dans la console.'
      + (loc ? ' <span class="pill ' + (loc.serverTake ? 'ok' : loc.serverTake === false ? 'wait' : 'grey') + '">' + (loc.serverTake ? 'enregistrée' : loc.serverTake === false ? 'refusée' : '—') + '</span>' : '') + '</div>'
      + '<div class="p">• <b>Position</b> — POST /franchisee/driver-position, toutes les 30 s en route. ' + esc(S.posMsg || '') + '</div>'
      + '<div class="p">• File d\'attente hors réseau : ' + DRV.queueSize() + ' écriture(s).</div></div>'
      + '<div class="card warn"><div class="h3">Reste sur ce téléphone</div>'
      + '<div class="p" style="color:var(--color-text);margin-top:6px">Les <b>scans de colis</b> (chargement et remise), la <b>note</b>, les <b>étoiles</b> et les <b>incidents</b> sont enregistrés ici, et <b>pas encore</b> au dépôt : l\'API n\'a pas d\'endpoint pour eux.</div>'
      + '<div class="p" style="color:var(--color-text);margin-top:6px">À écrire côté API : <code>POST /franchisee/driver-scan</code> (colis chargé / remis), <code>POST /franchisee/driver-stop</code> (arrivée, incident), <code>POST /franchisee/driver-close</code> (km, note, étoiles), <code>POST /franchisee/driver-sms</code> (envoi tracé).</div></div>'
      + '<div class="card soft"><div class="p" style="color:var(--color-text)">Session : '
      + esc(driverName() || '—') + ' · boutique ' + esc((S.me && S.me.name) || DRV.adminShop() || (DRV.session() || {}).shopId || '—')
      + ' · ' + (DRV.isAdmin() ? '<b>mode test (jeton admin réseau)</b>' : 'PIN chauffeur (12 h)') + '</div></div>'
      + '</div>'
      + '<div class="foot">' + (DRV.isAdmin()
          ? '<button class="btn gh" data-act="quitadmin">Oublier le jeton admin</button>'
          : '<button class="btn gh" data-act="logout">Se déconnecter</button>') + '</div>';
  }

  /* ── scanner QR ─────────────────────────────────────────────────────────
     DEUX décodeurs, dans cet ordre :
       1. BarcodeDetector, natif — quand le navigateur l'a (Chrome Android) ;
       2. jsQR, embarqué dans vendor/ — partout ailleurs. Il le fallait : sur
          iPhone (Safari) et sous Firefox, BarcodeDetector N'EXISTE PAS, donc
          l'appareil photo ne s'allumait jamais et l'app renvoyait vers une
          saisie manuelle. Embarqué, pas chargé d'un CDN : le scan doit marcher
          dans un sous-sol sans réseau.

     Et AVANT tout ça, le diagnostic : une caméra qui ne s'allume pas a presque
     toujours une de ces deux causes, et il vaut mieux la NOMMER que laisser
     chercher — page servie en http:// (aucun navigateur ne donne la caméra
     hors HTTPS), ou permission refusée. */
  var SC = { stream: null, video: null, det: null, timer: null, cv: null, cx: null,
             track: null, torch: false, torchOk: false, n: 0 };

  /* Outils du viseur : lampe (indispensable sur du papier en soute) et
     relance de la mise au point. Affichés seulement s'ils servent. */
  function scanTools() {
    var t = '<span style="margin-left:auto"></span>';
    if (SC.torchOk) t += '<button class="btn xs" style="background:' + (SC.torch ? 'var(--color-secondary)' : 'rgba(255,255,255,.16)')
      + ';color:' + (SC.torch ? 'var(--color-on-abricot)' : '#fff') + ';border:none" data-act="torche">Lampe</button>';
    if (SC.stream) t += '<button class="btn xs" style="background:rgba(255,255,255,.16);color:#fff;border:none;margin-left:6px" data-act="focus">Mise au point</button>';
    return t;
  }

  function camBlocage() {
    if (!window.isSecureContext && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      return 'La caméra exige HTTPS. Cette page est servie en ' + location.protocol
           + ' — ouvre-la en https:// (même adresse), sinon aucun navigateur n\'autorise le scan.';
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'Ce navigateur ne donne pas accès à la caméra. Ouvre l\'app dans Chrome (Android) ou Safari (iPhone).';
    }
    return null;
  }
  function camErreur(e) {
    var n = (e && e.name) || '';
    if (n === 'NotAllowedError' || n === 'SecurityError')
      return 'Accès à la caméra refusé. Autorise-le pour ce site (cadenas dans la barre d\'adresse, ou Réglages du téléphone), puis réessaie.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError')
      return 'Aucune caméra trouvée sur cet appareil.';
    if (n === 'NotReadableError')
      return 'La caméra est déjà utilisée par une autre application — ferme-la et réessaie.';
    return 'Caméra indisponible' + (n ? ' (' + n + ')' : '') + '.';
  }

  function mountScanner() {
    var host = document.getElementById('vf');
    if (!S.scanOn || !host) { if (!S.scanOn) stopScanner(); return; }
    /* Chaque rendu reconstruit le HTML, donc EMPORTE la balise vidéo. On ne
       redemande pas la caméra pour autant : on ré-accroche le flux déjà ouvert.
       Sans ça, chaque colis scanné rouvrait l'appareil photo (clignotement,
       batterie, et parfois refus du navigateur). */
    if (SC.video) {
      if (!host.contains(SC.video)) host.insertBefore(SC.video, host.firstChild);
      if (!SC.timer) SC.timer = setInterval(tick, 280);
      legende(); return;
    }
    var ko = camBlocage();
    if (ko) { S.scanOn = false; S.scanMsg = ko; render(); return; }

    var v = document.createElement('video');
    v.setAttribute('playsinline', ''); v.setAttribute('autoplay', ''); v.setAttribute('muted', '');
    v.muted = true; v.playsInline = true;
    host.insertBefore(v, host.firstChild);
    SC.video = v;
    /* RÉSOLUTION ET MISE AU POINT : un QR imprimé de 2 cm, filmé en 640×480
       sans autofocus, ne se décode pas — c'est exactement ce qu'on a vu sur le
       papier. On demande donc 1280×720 et la mise au point continue ; les deux
       sont des SOUHAITS (ideal / advanced), un téléphone qui ne sait pas faire
       rend simplement ce qu'il peut, sans échouer. */
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' },
               width: { ideal: 1280 }, height: { ideal: 720 },
               advanced: [{ focusMode: 'continuous' }] },
      audio: false })
      .then(function (st) {
        SC.stream = st; v.srcObject = st;
        SC.track = st.getVideoTracks()[0] || null;
        focusContinu();
        try { var cap = SC.track && SC.track.getCapabilities ? SC.track.getCapabilities() : {}; SC.torchOk = !!cap.torch; }
        catch (e) { SC.torchOk = false; }
        // Sur iOS, play() peut être rejeté sans geste : le scan part d'un
        // bouton, donc on est dans les clous — mais on ne bloque pas dessus.
        return v.play().catch(function () {});
      })
      .then(function () {
        if (window.BarcodeDetector) {
          try { SC.det = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] }); }
          catch (e) { SC.det = null; }
        }
        if (!SC.det && !window.jsQR) {
          S.scanOn = false; stopScanner();
          S.scanMsg = 'Décodeur QR absent (vendor/jsqr.js non chargé) — recharge la page.'; render(); return;
        }
        S.scanMsg = '';
        if (!SC.cv) { SC.cv = document.createElement('canvas'); SC.cx = SC.cv.getContext('2d', { willReadFrequently: true }); }
        SC.timer = setInterval(tick, 280);
        // Surtout PAS render() ici : il reconstruirait le HTML et jetterait la
        // vidéo qu'on vient d'accrocher. Seule la légende bouge.
        legende();
      })
      .catch(function (e) {
        S.scanOn = false; stopScanner();
        S.scanMsg = camErreur(e);
        render();
      });
  }

  /* Mise au point continue, redemandée : certains téléphones l'oublient après
     quelques secondes, et le QR redevient flou sans rien dire. */
  function focusContinu() {
    if (!SC.track || !SC.track.applyConstraints) return;
    try { SC.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {}); } catch (e) {}
  }
  function torche(on) {
    if (!SC.track || !SC.track.applyConstraints) return Promise.resolve(false);
    return SC.track.applyConstraints({ advanced: [{ torch: !!on }] }).then(function () { SC.torch = !!on; return true; },
                                                                          function () { return false; });
  }

  function tick() {
    var v = SC.video;
    if (!v || !v.videoWidth) return;
    /* LES DEUX DÉCODEURS, pas l'un OU l'autre. Le lecteur natif est plus
       rapide mais rend parfois zéro code sur un QR imprimé un peu flou, là où
       jsQR y arrive (et l'inverse). Le natif passe à chaque image, jsQR une
       image sur trois — assez pour rattraper, sans faire chauffer le
       téléphone. */
    if (SC.det) {
      SC.det.detect(v).then(function (codes) {
        if (codes && codes.length) onCode(String(codes[0].rawValue || '').trim());
      }).catch(function () {});
      SC.n = (SC.n || 0) + 1;
      if (!window.jsQR || (SC.n % 3)) return;
    }
    // jsQR travaille sur une image réduite — mais pas trop : sous ~640 px de
    // large, les modules d'un QR de bon de livraison se confondent.
    var w = Math.min(720, v.videoWidth), h = Math.round(v.videoHeight * (w / v.videoWidth));
    SC.cv.width = w; SC.cv.height = h;
    SC.cx.drawImage(v, 0, 0, w, h);
    var img;
    try { img = SC.cx.getImageData(0, 0, w, h); } catch (e) { return; }
    var r = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (r && r.data) onCode(String(r.data).trim());
  }

  /* La légende dit l'ÉTAT RÉEL : tant que le flux n'est pas ouvert, elle
     annonce le démarrage — elle ne prétend pas scanner. */
  function scanMoteur() {
    if (!SC.stream) return 'démarrage de la caméra…';
    return SC.det ? 'lecteur natif' : 'lecteur embarqué';
  }
  function legende() {
    var el = document.querySelector('.scan .lg');
    if (el && el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = 'Scan — ' + scanMoteur() + ' ';
    else if (el) el.insertBefore(document.createTextNode('Scan — ' + scanMoteur() + ' '), el.firstChild);
  }

  function stopScanner() {
    if (SC.timer) clearInterval(SC.timer); SC.timer = null;
    if (SC.stream) SC.stream.getTracks().forEach(function (t) { t.stop(); });
    SC.stream = null; SC.det = null; SC.track = null; SC.torch = false; SC.torchOk = false; SC.n = 0;
    if (SC.video && SC.video.parentNode) SC.video.parentNode.removeChild(SC.video);
    SC.video = null;
  }

  /* Un code lu ne vaut que s'il DÉSIGNE quelque chose d'attendu ici : sinon
     on le dit, on ne valide rien au hasard. */
  function norm(x) { return String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function onCode(txt) {
    if (!txt || txt === S.lastScan) return;
    S.lastScan = txt;
    if (S.screen === 'pick') return matchTour(txt);
    var refs = (S.screen === 'load')
      ? allOrders(S.tourId).map(function (x) { return x.o.ref; })
      : (tourStops(S.tourId)[S.stopIx] || { orders: [] }).orders.map(function (o) { return o.ref; });
    var n = norm(txt);
    var hit = refs.find(function (r) { return norm(r) === n || (n.length > 3 && n.indexOf(norm(r)) >= 0); });
    if (!hit) { S.scanMsg = 'Code inconnu ici : ' + txt.slice(0, 24); vibrate([90, 60, 90]); render(); return; }
    if (S.screen === 'load') validateLoad(hit, null); else validateDeliver(hit, null);
  }
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

  function matchTour(txt) {
    var n = norm(txt);
    var dispo = toursToday();
    /* Le QR a été LU — c'est déjà une bonne nouvelle, et il faut le dire :
       sans ça, « bon non reconnu » se lit comme « la caméra ne marche pas »,
       alors que le vrai problème est presque toujours en dessous — aucune
       tournée chargée, parce que l'API refuse ou ne sert rien. */
    if (!dispo.length) {
      S.scanMsg = '✓ QR lu : « ' + txt.slice(0, 28) + ' ». Mais AUCUNE tournée n\'est chargée — '
        + (S.err ? 'voir le bandeau rouge ci-dessus.' : 'le serveur n\'en sert aucune aujourd\'hui.');
      vibrate([60]); render(); return;
    }
    var t = dispo.find(function (x) {
      return n.indexOf(norm(x.name)) >= 0 || n.indexOf(norm(x.short)) >= 0 || n.indexOf(norm('T' + numId(x.id))) >= 0;
    });
    if (!t) {
      S.scanMsg = '✓ QR lu : « ' + txt.slice(0, 28) + ' » — mais aucune tournée du jour ne porte ce nom ('
        + dispo.map(function (x) { return x.name; }).join(', ') + '). Choisis dans la liste.';
      vibrate([90, 60, 90]); render(); return;
    }
    S.tourId = numId(t.id); S.scanOn = false; S.scanMsg = ''; stopScanner(); vibrate(60);
    toast('Bon reconnu — ' + t.name); render();
  }

  function validateLoad(ref, why) {
    var loc = tourLocal(S.tourId);
    loc.loaded[ref] = hhmm(); if (why) { (loc.loadedWhy = loc.loadedWhy || {})[ref] = why; }
    saveDay(); vibrate(60); S.scanMsg = ''; render();
  }
  function validateDeliver(ref, why) {
    var s = tourStops(S.tourId)[S.stopIx]; if (!s) return;
    var loc = tourLocal(S.tourId);
    loc.delivered[s.key] = loc.delivered[s.key] || {};
    loc.delivered[s.key][ref] = hhmm(); if (why) { (loc.deliveredWhy = loc.deliveredWhy || {})[ref] = why; }
    saveDay(); vibrate(60); S.scanMsg = ''; render();
  }

  /* ── position (le dépôt suit la tournée en direct) ─────────────────── */
  var POS = { watch: null, timer: null, last: null };
  function startPos() {
    if (POS.watch != null || !navigator.geolocation) { if (!navigator.geolocation) { S.posState = 'ko'; S.posMsg = 'Ce téléphone ne donne pas sa position.'; } return; }
    POS.watch = navigator.geolocation.watchPosition(function (p) {
      POS.last = p.coords; if (S.posState === 'off') sendPos();
    }, function (e) {
      S.posState = 'ko'; S.posMsg = 'Position refusée (' + (e && e.message ? e.message : 'permission') + ').';
      if (S.screen === 'drive' || S.screen === 'sync') render();
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    POS.timer = setInterval(sendPos, 30000);
  }
  function stopPos() {
    if (POS.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(POS.watch);
    POS.watch = null; if (POS.timer) clearInterval(POS.timer); POS.timer = null;
  }
  function sendPos() {
    if (!POS.last || !S.tourId) return;
    if (S.posState === 'refused') return;         // 403 : inutile de marteler
    DRV.post('/franchisee/driver-position', { tourId: Number(S.tourId), lat: POS.last.latitude, lng: POS.last.longitude,
                                              driver: driverName() })
      .then(function () { S.posState = 'ok'; S.posMsg = 'Envoyée à ' + hhmm() + ' — le dépôt te suit.'; touch(); },
            function (e) {
              if (e.status === 403) { S.posState = 'refused'; S.posMsg = 'Le dépôt ne reçoit pas ta position : l\'endpoint driver-position n\'est pas ouvert à un compte PIN (réglage serveur).'; }
              else if (e.status === 0) { S.posState = 'ko'; S.posMsg = 'Hors réseau — position non envoyée.'; }
              else { S.posState = 'ko'; S.posMsg = e.message; }
              touch();
            });
  }
  function touch() { if (S.screen === 'drive' || S.screen === 'sync') render(); }

  /* ── actions ──────────────────────────────────────────────────────── */
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act');
    var loc = S.tourId ? tourLocal(S.tourId) : null;
    var stops = S.tourId ? tourStops(S.tourId) : [];
    var s = stops[S.stopIx];

    if (a === 'pin') { if (S.pin.length < 4) S.pin += el.getAttribute('data-n'); return render(); }
    if (a === 'pindel') { S.pin = S.pin.slice(0, -1); return render(); }
    if (a === 'pinclr') { S.pin = ''; return render(); }
    if (a === 'dologin') {
      S.busy = true; S.err = null; render();
      return DRV.login(S.shopId, S.pin).then(function () { S.pin = ''; S.busy = false; return loadAll(); },
        function (er) { S.busy = false; S.pin = ''; S.err = er.message; render(); });
    }
    if (a === 'drvname') { return; }
    if (a === 'setscope') {
      if (!S.shopId) { toast('Écris l\'id de la boutique'); return; }
      try { localStorage.setItem('drv_shop', S.shopId); } catch (er) {}
      S.screen = 'boot'; render(); return loadAll();
    }
    if (a === 'quitadmin') {
      DRV.clearAdmin(); S.me = null; S.tours = []; S.tree = []; S.dispatch = []; S.tourId = null;
      S.screen = DRV.session() ? 'pick' : 'login';
      if (S.screen === 'login') DRV.shops().then(function (l) { S.shops = Array.isArray(l) ? l : []; render(); });
      toast('Jeton admin oublié sur ce téléphone'); return render();
    }
    if (a === 'logout') { return DRV.logout().then(function () { S.screen = 'login'; S.me = null; render(); }); }

    if (a === 'seltour') { S.tourId = Number(el.getAttribute('data-id')); return render(); }
    if (a === 'veh') { loc.vehicle = el.getAttribute('data-v'); saveDay(); return render(); }
    if (a === 'vehother') { var v = prompt('Plaque du véhicule'); if (v) { loc.vehicle = v.trim(); saveDay(); render(); } return; }
    if (a === 'take') { return takeTour(); }
    if (a === 'goSync') { S.back = S.screen; S.screen = 'sync'; return render(); }
    if (a === 'goback') { S.screen = S.back || (S.tourId ? 'route' : 'pick'); return render(); }
    if (a === 'goPick') { S.screen = 'pick'; return render(); }
    if (a === 'goroute') { S.screen = 'route'; return render(); }
    if (a === 'godrive') { S.screen = 'drive'; return render(); }
    if (a === 'goclose') { S.screen = 'close'; return render(); }
    if (a === 'gostop') { S.stopIx = Number(el.getAttribute('data-i')); S.screen = 'drive'; return render(); }

    if (a === 'scanon') { S.scanOn = !S.scanOn; S.scanMsg = ''; S.lastScan = ''; return render(); }
    if (a === 'torche') { return torche(!SC.torch).then(function (ok) { if (!ok) toast('Lampe non disponible sur ce téléphone'); render(); }); }
    if (a === 'focus') { if (!SC.stream) return; focusContinu(); toast('Mise au point relancée — tiens le QR à ~20 cm'); return; }
    /* La saisie du numéro de bon a été RETIRÉE : le bon se scanne, et si le QR
       ne passe pas, la tournée se choisit dans la liste juste dessous — une
       liste de ce que le serveur sert vaut mieux qu'un numéro tapé de mémoire. */
    if (a === 'manualref') {
      var r = prompt('Numéro de colis (sur l\'étiquette)'); if (!r) return;
      S.lastScan = ''; return onCode(r.trim());
    }
    if (a === 'loadone') {
      var ref = el.getAttribute('data-ref');
      var why = prompt('Colis ' + ref + ' — motif de la validation à la main (QR illisible, étiquette absente…)');
      if (!why) return; return validateLoad(ref, why.trim());
    }
    if (a === 'missing') {
      var mr = prompt('Colis manquant — numéro'); if (!mr) return;
      var mw = prompt('Ce qui manque / pourquoi'); if (!mw) return;
      (loc.missing = loc.missing || {})[mr.trim()] = mw.trim(); saveDay(); toast('Colis ' + mr + ' signalé manquant'); return render();
    }
    if (a === 'loaddone') { S.screen = 'route'; return render(); }

    if (a === 'arrive') { loc.arrived[s.key] = hhmm(); saveDay(); S.screen = 'stop'; return render(); }
    if (a === 'inc') {
      var k = el.getAttribute('data-k'); var d2 = prompt(k + ' — précise (visible au dépôt dans la note)');
      if (d2 === null) return;
      loc.note = (loc.note ? loc.note + '\n' : '') + hhmm() + ' · ' + (s ? s.libelle + ' — ' : '') + k + (d2 ? ' : ' + d2.trim() : '');
      if (loc.tags.indexOf(k) < 0 && TAGS.indexOf(k) >= 0) loc.tags.push(k);
      saveDay(); toast(k + ' noté'); return render();
    }

    if (a === 'deliverone') {
      var dref = el.getAttribute('data-ref');
      if ((loc.delivered[s.key] || {})[dref]) return;
      var dw = prompt('Colis ' + dref + ' — motif de la remise cochée à la main');
      if (!dw) return; return validateDeliver(dref, dw.trim());
    }
    if (a === 'smssent') { loc.sms[s.key] = hhmm(); saveDay(); setTimeout(render, 400); return; }
    if (a === 'smstpl') {
      var t2 = prompt('Modèle du SMS — {prenom}, {bureau}, {boutique}', smsTpl());
      if (t2 != null) { try { localStorage.setItem(LS_TPL, t2); } catch (er) {} render(); }
      return;
    }
    if (a === 'stopdone') {
      loc.done[s.key] = hhmm(); saveDay();
      var next = stops.findIndex(function (x, i) { return i > S.stopIx && !loc.done[x.key]; });
      if (next < 0) next = stops.findIndex(function (x) { return !loc.done[x.key]; });
      if (next < 0) { S.screen = 'close'; } else { S.stopIx = next; S.screen = 'route'; }
      return render();
    }

    if (a === 'ratetour') { loc.rating = Number(el.getAttribute('data-v')); saveDay(); return render(); }
    if (a === 'rateday') { day().rating = Number(el.getAttribute('data-v')); saveDay(); return render(); }
    if (a === 'tagtour') { toggleTag(loc.tags, el.getAttribute('data-t')); saveDay(); return render(); }
    if (a === 'tagday') { toggleTag(day().tags, el.getAttribute('data-t')); saveDay(); return render(); }
    if (a === 'closenext' || a === 'closeday') {
      loc.closedAt = hhmm(); saveDay();
      if (a === 'closeday') { S.screen = 'day'; return render(); }
      var others = toursToday().filter(function (x) { var i = String(numId(x.id)); return i !== String(S.tourId) && !(day().tours[i] && day().tours[i].closedAt); });
      S.tourId = others.length ? numId(others[0].id) : null; S.stopIx = 0; S.screen = 'pick'; return render();
    }
    if (a === 'endday') { day().closedAt = hhmm(); saveDay(); toast('Journée clôturée — bonne fin de journée'); S.tourId = null; S.screen = 'pick'; return render(); }
  });
  function toggleTag(arr, t) { var i = arr.indexOf(t); if (i >= 0) arr.splice(i, 1); else arr.push(t); }

  /* Saisies : on n'appelle PAS render() à chaque frappe (le champ perdrait le
     focus). L'état est gardé au fil de la saisie, l'écran se redessine au
     prochain geste. */
  app.addEventListener('input', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act'), v = el.value;
    var loc = S.tourId ? tourLocal(S.tourId) : null;
    var s = loc ? tourStops(S.tourId)[S.stopIx] : null;
    if (a === 'shopnum') { S.shopId = v.replace(/\D/g, ''); return; }
    if (a === 'drvname') { DRV.driverName(v); return; }
    if (a === 'km0' && loc) { loc.km0 = v.replace(/\D/g, ''); return saveDay(); }
    if (a === 'km1' && loc) { loc.km1 = v.replace(/\D/g, ''); return saveDay(); }
    if (a === 'notetour' && loc) { loc.note = v; return saveDay(); }
    if (a === 'noteday') { day().note = v; return saveDay(); }
    if (a === 'phone' && loc && s) { loc.phones[s.key] = v; return saveDay(); }
  });
  app.addEventListener('change', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    if (el.getAttribute('data-act') === 'shop') { S.shopId = el.value; render(); }
  });

  function takeTour() {
    var t = tourById(S.tourId); if (!t) return;
    var loc = tourLocal(S.tourId);
    loc.takenAt = hhmm(); loc.name = t.name; saveDay();
    S.screen = 'load'; S.stopIx = 0; S.err = null; render();
    DRV.postQueued('/franchisee/tour-dispatch', { tour: t.name, driver: driverName() })
      .then(function (r) {
        loc.serverTake = !(r && r.queued); saveDay();
        toast(r && r.queued ? 'Hors réseau — prise de tournée en attente d\'envoi' : 'Tournée prise — le dépôt te voit dessus');
      }, function (er) {
        loc.serverTake = false; saveDay();
        S.err = 'Prise de tournée NON enregistrée au dépôt : ' + er.message; render();
      });
  }

  /* ── démarrage ────────────────────────────────────────────────────── */
  function boot() {
    render();
    DRV.flush();
    if (DRV.isAdmin()) {
      if (!DRV.adminShop()) { S.screen = 'noscope'; return render(); }
      return loadAll().then(reprise);
    }
    if (!DRV.session()) {
      S.screen = 'login';
      DRV.shops().then(function (list) {
        S.shops = Array.isArray(list) ? list.filter(function (x) { return x && x.id; }) : [];
        try { var q = new URLSearchParams(location.search); if (q.get('shop')) S.shopId = q.get('shop'); } catch (e) {}
        render();
      });
      return;
    }
    loadAll().then(reprise);
  }
  // Reprise : une tournée ouverte aujourd'hui et non clôturée est rouverte —
  // un chauffeur qui relance l'app doit retomber sur sa tournée, pas sur la
  // liste comme s'il n'avait rien fait.
  function reprise() {
    var d = day();
    var open = Object.keys(d.tours).find(function (i) { return d.tours[i].takenAt && !d.tours[i].closedAt; });
    if (open) { S.tourId = Number(open); S.screen = 'route'; render(); }
  }

  boot();
})();
