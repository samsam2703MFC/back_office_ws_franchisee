#!/usr/bin/env node
/* =============================================================================
   build-pdf.cjs — le guide « Bien démarrer » en PDF, à la charte, avec captures.
   =============================================================================
   Le contenu N'EST PAS recopié ici : le script sert le dépôt en local, ouvre la
   console dans Chromium, évalue la classe de la page (comme le fait le runtime
   DC) et lui demande ses chapitres en mode document — onbChapters({console,
   driver, webshop}) — ainsi que ONB_VERSION, ONB_DATE et ONB_NOTES. Le PDF dit
   donc exactement ce que l'écran dit, dans sa version courante.

   La mise en page vient de _ds/…/global.css (jetons, Gotham / Vank / Playwrite)
   + docs/onboarding/guide.css. Les captures sont celles du dépôt
   (docs/landing/*.png, docs/driver-pwa/app/*.png) plus une capture fraîche de
   l'écran du guide lui-même, prise au passage. Chaque chapitre finit par la
   galerie de ses écrans.

   USAGE
     node docs/onboarding/build-pdf.cjs [--host https://atelierby.online]
                                        [--out docs/onboarding/guide-franchise.pdf]
                                        [--html /tmp/guide.html]

     --host  l'hôte public, pour les adresses imprimées (défaut : « https://<hôte> »,
             c'est-à-dire un espace à remplir — rien n'est deviné).

   PRÉREQUIS
     Node 18+ et Playwright avec Chromium :  npm i -D playwright && npx playwright install chromium
     (ou PLAYWRIGHT_MODULE=/chemin/vers/node_modules/playwright, CHROMIUM_PATH=/chemin/vers/chrome).
============================================================================= */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..', '..');
const DS = '_ds/l-atelier-by-8504a4e3-7796-44da-b087-3fbd9dcb8dcd/global.css';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const HOST = (arg('host', '') || 'https://<hôte>').replace(/\/$/, '');
const OUT = path.resolve(arg('out', path.join(__dirname, 'guide-franchise.pdf')));
const HTML_OUT = arg('html', '');

function loadPlaywright() {
  const cands = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const c of cands) { try { return require(c); } catch (e) { /* suivant */ } }
  throw new Error('Playwright introuvable : npm i -D playwright && npx playwright install chromium');
}

/* Serveur statique minimal : le dépôt sous /webshop/backoffice_franchisee/,
   comme en production, pour que la console calcule ses adresses au bon chemin.
   Les pages à imprimer sont servies par le même serveur (/__guide/…) : ainsi
   les polices du design system sont en même origine — chargées depuis
   about:blank, elles seraient refusées (CORS) et remplacées par une police
   système sans que rien ne le dise. */
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', otf: 'font/otf', ttf: 'font/ttf', json: 'application/json', webmanifest: 'application/manifest+json' };
const PAGES = new Map();
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.startsWith('/__guide/')) { const h = PAGES.get(p.slice(9)); if (h == null) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME.html }); return res.end(h); }
      p = p.replace(/^\/webshop\/backoffice_franchisee/, '');
      if (p === '' || p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).slice(1)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* Une adresse dans une phrase est mise en évidence ; le reste est du texte. */
const rich = (t) => esc(t).replace(/(https?:\/\/[^\s—]+|mailto:[^\s]+)/g, (m) => '<span class="addr">' + m + '</span>');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

/* Les écrans de chaque chapitre, avec leur légende. Toutes les images sont dans
   le dépôt ; une image absente est simplement sautée. « __guide__ » est la
   capture fraîche de l'écran du guide, prise au passage. */
const SHOTS = {
  start: [{ src: '__guide__', caption: '<b>Le guide dans la console.</b> Entrée « Bien démarrer » en tête du menu, chapitres en onglets ; chaque étape ouvre l’écran réel.' },
          { src: 'docs/landing/franchisee-recherche.png', caption: '<b>Rechercher un écran.</b> Le champ en tête du menu cherche dans les écrans, leurs onglets et leurs explications.' }],
  webshop: [{ src: 'docs/landing/franchisee-dashboard.png', caption: '<b>Tableau de bord.</b> Les commandes du jour, groupées par tournée › zone › site › office, avec le cut-off restant.' },
            { src: 'docs/landing/franchisee-b2b.png', caption: '<b>Demandes B2B.</b> Accès aux comptes Office, rattachements, nouveaux bureaux.' }],
  day: [{ src: 'docs/landing/franchisee-stock.png', caption: '<b>Stock du jour.</b> Ce que le webshop consulte avant d’accepter une commande.' },
        { src: 'docs/landing/franchisee-preparation.png', caption: '<b>Préparation.</b> Étiquettes, listes de production, l’arbre à préparer tournée › site › office.' },
        { src: 'docs/landing/franchisee-livraison.png', caption: '<b>Livraison du jour.</b> L’état des tournées, vu du magasin.' },
        { src: 'docs/landing/franchisee-incidents.png', caption: '<b>Incidents.</b> Preuve, horodatage, chauffeur, décision.' },
        { src: 'docs/landing/franchisee-capacite.png', caption: '<b>Capacité · remplissage.</b> Réservé / maximum par date et par créneau.' },
        { src: 'docs/landing/franchisee-rentabilite.png', caption: '<b>Rentabilité.</b> CA → marge, une fois les coûts posés en face.' }],
  apps: [{ phones: [
            ['docs/driver-pwa/app/2-prendre-tournee.png', 'Prendre sa tournée — scan du bon'],
            ['docs/driver-pwa/app/3-chargement.png', 'Chargement — un scan par colis'],
            ['docs/driver-pwa/app/4-feuille-de-route.png', 'Feuille de route'] ] },
         { phones: [
            ['docs/driver-pwa/app/5-en-route.png', 'En route — position vers la console'],
            ['docs/driver-pwa/app/6-remise-sms.png', 'Remise et SMS d’arrivée'],
            ['docs/driver-pwa/app/7-retour-depot.png', 'Retour dépôt — km, note, étoiles'] ],
           legend: 'Application chauffeur : captures de l’application réelle sur un jeu d’essai (deux tournées, cinq colis). Vos écrans montrent vos tournées.' }],
};
const LEGEND_CONSOLE = 'Captures d’écran de la console sur un jeu d’essai — vos écrans montrent vos données.';

function figure(src, caption, base) {
  return '<figure class="shot"><img src="' + esc(src.startsWith('data:') ? src : base + '/' + src) + '" alt=""/><figcaption>' + caption + '</figcaption></figure>';
}
function phones(list, legend, base) {
  const ok = list.filter(([f]) => exists(f));
  if (!ok.length) return '';
  return '<div class="phones">' + ok.map(([f, c]) => '<figure><img src="' + esc(base + '/' + f) + '" alt=""/><figcaption>' + esc(c) + '</figcaption></figure>').join('') + '</div>'
    + (legend ? '<div class="legend">' + esc(legend) + '</div>' : '');
}
function gallery(k, base, guideShot) {
  const list = SHOTS[k] || []; let h = ''; let legend = false;
  list.forEach((s) => {
    if (s.phones) { h += phones(s.phones, s.legend, base); return; }
    const src = s.src === '__guide__' ? guideShot : s.src;
    if (!src || (!src.startsWith('data:') && !exists(src))) return;
    h += figure(src, s.caption, base);
    if (!legend && src !== guideShot) { h += '<div class="legend">' + esc(LEGEND_CONSOLE) + '</div>'; legend = true; }
  });
  return h ? '<div class="gallery"><h4>Les écrans de ce chapitre</h4>' + h + '</div>' : '';
}

/* L'étiquette « où » d'une étape : l'écran réel (son adresse), ou le geste. */
function where(s) {
  if (s.href) return '';
  if (s.act === 'profile') return '<span class="go">' + esc(s.goLabel || 'Mon compte') + ' <span class="frag">· rond en bas du menu</span></span>';
  if (!s.s) return '';
  return '<span class="go">' + esc(s.goLabel || 'Ouvrir') + ' <span class="frag">#' + esc(s.s) + (s.act === 'ob' ? ' · « + Onboarder un bureau »' : '') + '</span></span>';
}
function stepHtml(s, i) {
  return '<div class="step"><span class="num">' + (i + 1) + '</span><div class="body"><div class="t">' + esc(s.t) + '</div><div class="d">' + rich(s.d) + '</div>' + where(s) + '</div></div>';
}
function cardHtml(k) {
  const steps = k.steps || [];
  // Titre, sous-titre et première étape dans un bloc insécable : un titre seul
  // en bas de page, c'est ce qu'on a vu à la première épreuve.
  let h = '<div class="card"><div class="card-head"><h3>' + esc(k.titre) + '</h3>';
  if (k.sub) h += '<div class="sub">' + esc(k.sub) + '</div>';
  if (steps.length) h += stepHtml(steps[0], 0);
  h += '</div>';
  steps.slice(1).forEach((s, i) => { h += stepHtml(s, i + 1); });
  if (k.map && k.map.length) {
    h += '<div class="map"><div class="h">Ce que le client voit</div><div class="h">Où vous le réglez</div>';
    k.map.forEach((m) => { h += '<div class="voit">' + esc(m.voit) + '</div><div>' + esc(m.regle) + (m.s ? '<br/><span class="go">' + esc(m.goLabel || 'Ouvrir') + ' · #' + esc(m.s) + '</span>' : '') + '</div>'; });
    h += '</div>';
  }
  if (k.note) h += '<div class="note' + (k.noteCls ? ' warn' : '') + '">' + esc(k.note) + '</div>';
  return h + '</div>';
}
const SUBS = { start: 'Votre accès, vos repères, et la mise en route dans l’ordre.', webshop: 'Comment vos clients commandent, et où chaque chose se règle.', day: 'Écran par écran, dans l’ordre de la journée.', grow: 'Les outils pour gagner des bureaux et vendre plus.', apps: 'Application chauffeur, tablette Kitchen, boutique en ligne.', news: 'Ce qui change, version après version.', help: 'Support, écrans vides, bandeau rouge, origine des données.' };
function chapterHtml(c, idx, data, base, guideShot) {
  let h = '<section class="chapter" id="ch-' + c.k + '"><div class="chapter-head"><span class="n">' + (idx + 1) + '</span><div><h2>' + esc(c.label) + '</h2><div class="sub">' + esc(SUBS[c.k] || '') + '</div></div></div>';
  if (c.k === 'news') {
    h += '<div class="card"><h3>Ce qui change, version après version</h3><div class="sub">La version en tête est celle de ce guide. Chaque note dit ce qui change pour vous.</div>';
    data.notes.forEach((r, i) => { h += '<div class="rel' + (i === 0 ? ' cur' : '') + '"><div class="head"><span class="pill">' + esc(r.version) + '</span><span class="titre">' + esc(r.titre) + '</span><span class="date">' + esc(r.date) + '</span></div><ul>' + r.points.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul></div>'; });
    h += '</div>';
  }
  (c.cards || []).forEach((k) => { h += cardHtml(k); });
  return h + gallery(c.k, base, guideShot) + '</section>';
}
function frontHtml(data, base, toc) {
  const rows = data.chapters.map((c, i) => '<li><span class="n">' + (i + 1) + '</span><span class="t">' + esc(c.label) + '</span><span class="s">' + esc((c.cards || []).map((k) => k.titre).slice(0, 3).join(' · ')) + '</span><span class="p">' + (toc && toc[i] ? toc[i] : '') + '</span></li>').join('');
  return '<section class="cover"><img class="logo" src="' + base + '/img/logo.png" alt="L’Atelier"/><div class="kicker">Console franchisé · Back-office WebShop</div>'
    + '<div class="script">Bienvenue</div><h1>Bien démarrer</h1><div class="h1b">avec votre console</div>'
    + '<div class="lead">Comment le webshop travaille pour vos clients, comment se déroule votre journée dans la console, quels outils vous avez pour développer votre activité — et ce qui change à chaque version.</div>'
    + (exists('docs/landing/franchisee-dashboard.png') ? '<div class="shot"><img src="' + base + '/docs/landing/franchisee-dashboard.png" alt=""/></div>' : '')
    + '<div class="foot"><span class="ver">Guide · version ' + esc(data.version) + ' · ' + esc(data.date) + '</span><span>Le même guide est dans la console : menu Aide › Bien démarrer.</span></div></section>'
    + '<section class="toc"><h2>Sommaire</h2><ol>' + rows + '</ol></section>';
}
const wrap = (base, title, inner) => '<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>' + esc(title) + '</title><link rel="stylesheet" href="' + base + '/' + DS + '"/><link rel="stylesheet" href="' + base + '/docs/onboarding/guide.css"/></head><body>' + inner + '</body></html>';

const countPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;
const PDF_OPTS = { format: 'A4', printBackground: true, preferCSSPageSize: true, outline: true, tagged: true,
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;padding:0 14mm;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#666;display:flex;justify-content:space-between"><span>L’Atelier By — Console franchisé · Bien démarrer</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' };

(async () => {
  const { chromium } = loadPlaywright();
  const { srv, base } = await serve();
  const exe = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
    // 1. La console, servie comme en production ; le guide s'ouvre (première visite).
    await page.goto(base + '/webshop/backoffice_franchisee/?shop=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // 2. Les chapitres, demandés à la classe de la page — en mode document.
    const doc = { console: HOST + '/webshop/backoffice_franchisee/?shop=<id>', driver: HOST + '/webshop/driver/?shop=<id>', webshop: HOST + '/webshop/' };
    const data = await page.evaluate((doc) => {
      const src = document.querySelector('script[data-dc-script]').textContent;
      const Base = class { constructor(p) { this.props = p || {}; this.state = {}; } setState() {} };
      const C = new Function('DCLogic', 'StreamableLogic', 'React', src + '\n;return Component;')(Base, Base, window.React);
      const inst = new C({});
      return { version: inst.ONB_VERSION, date: inst.ONB_DATE, support: inst.ONB_SUPPORT, notes: inst.ONB_NOTES, chapters: inst.onbChapters(doc) };
    }, doc);
    if (!data.chapters || !data.chapters.length) throw new Error('aucun chapitre : la page n’a pas rendu onbChapters()');
    console.log('guide ' + data.version + ' (' + data.date + ') — ' + data.chapters.length + ' chapitres, ' + data.notes.length + ' notes de version');
    // 3. Une capture fraîche de l'écran du guide — sans le bandeau d'erreur ni la
    //    bulle « données à compléter », propres au poste de génération (pas d'API),
    //    et avec les adresses génériques à la place de celles du serveur local.
    await page.addStyleTag({ content: '#bo-errors{display:none!important} button[title*="à compléter"]{display:none!important}' });
    await page.evaluate((doc) => {
      document.querySelectorAll('.onb-d').forEach((el) => {
        let t = el.textContent;
        t = t.replace(/Boutique en portée : [^.]*\. /, '').replace(/https?:\/\/127\.0\.0\.1:\d+\/webshop\/backoffice_franchisee\/\?shop=\d+(#\w+)?/g, doc.console + '$1');
        if (t !== el.textContent) el.textContent = t;
      });
    }, doc);
    await page.waitForTimeout(300);
    const guideShot = 'data:image/png;base64,' + (await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1440, height: 600 } })).toString('base64');

    // 4. Rendu. Pour le sommaire, le document est rendu par PRÉFIXES croissants
    //    (couverture + sommaire + chapitres 1..i) : la pagination d'un préfixe est
    //    celle du document entier, ce qu'une partie rendue seule ne garantit pas.
    //    Les pages sont servies en même origine (polices).
    const pdfPage = await (await browser.newContext()).newPage();
    const DEBUG = arg('debug-dir', '');
    const render = async (name, html) => { PAGES.set(name, html); await pdfPage.goto(base + '/__guide/' + name, { waitUntil: 'load' }); await pdfPage.evaluate(() => document.fonts.ready); await pdfPage.waitForTimeout(400); const buf = await pdfPage.pdf(PDF_OPTS); if (DEBUG) { fs.mkdirSync(DEBUG, { recursive: true }); fs.writeFileSync(path.join(DEBUG, name + '.pdf'), buf); fs.writeFileSync(path.join(DEBUG, name + '.html'), html); } return buf; };
    const title = 'Console franchisé — Bien démarrer (guide ' + data.version + ')';
    const parts = data.chapters.map((c, i) => chapterHtml(c, i, data, base, guideShot));
    const front = countPages(await render('front', wrap(base, title, frontHtml(data, base, null))));
    const toc = [front + 1];
    for (let i = 1; i < parts.length; i++) toc.push(countPages(await render('prefix' + i, wrap(base, title, frontHtml(data, base, null) + parts.slice(0, i).join('')))) + 1);
    const html = wrap(base, title, frontHtml(data, base, toc) + parts.join('')
      + '<div class="colophon">Guide du franchisé — version ' + esc(data.version) + ' du ' + esc(data.date) + '. Adresses : ' + esc(HOST) + '. Support : ' + esc(data.support) + '. Généré depuis la console (docs/onboarding/build-pdf.cjs).</div>');
    if (HTML_OUT) fs.writeFileSync(HTML_OUT, html);
    const pdf = await render('guide', html);
    const fonts = Array.from(new Set((pdf.toString('latin1').match(/\/BaseFont\s*\/[A-Za-z0-9+_-]+/g) || []).map((m) => m.replace(/.*\//, '').replace(/^[A-Z]{6}\+/, ''))));
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, pdf);
    console.log('pages : ' + countPages(pdf) + ' (couverture + sommaire : ' + front + ' ; chapitres : ' + toc.join(', ') + ') → ' + OUT + ' (' + Math.round(pdf.length / 1024) + ' Ko)');
    console.log('polices embarquées : ' + fonts.join(', '));
  } finally { await browser.close(); srv.close(); }
})().catch((e) => { console.error('ÉCHEC : ' + (e && e.message || e)); process.exit(1); });
