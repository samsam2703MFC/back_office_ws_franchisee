"use strict";
/* ==========================================================================
   L'Atelier By — Console marque (franchiseur) · back_office_ws_franchisor

   Data-driven implementation. This file contains ZERO domain data: every
   shop, product, user, column, colour, label and form is described in
   data.json and fetched at init (mirroring the design system's
   "GET /api/v1/theme" bootstrap). app.js is only a generic render engine.
   ========================================================================== */

var DB = null;                 // the fetched data.json
var state = {
  screen: null, flags: {}, paramNavOpen: false,
  formKey: null, formVals: {}, formEdit: false, toast: ''
};
var toastTimer = null;

/* ----- boot -------------------------------------------------------------- */
function boot(){
  fetch('./data.json', { cache: 'no-store' })
    .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(db){
      DB = db;
      // apply theme tokens to :root (design-system init contract)
      Object.keys(DB.theme || {}).forEach(function(k){
        document.documentElement.style.setProperty(k, DB.theme[k]);
      });
      state.screen = DB.defaultScreen;
      (DB.nav || []).forEach(function(b){ if (b.collapsible) state.paramNavOpen = !!b.open; });
      render();
    })
    .catch(function(err){
      document.getElementById('app').innerHTML =
        '<div style="max-width:520px;margin:80px auto;font:400 14px/1.6 var(--font-ui);color:var(--color-text)">'
        + '<div class="t-section-title" style="font-size:20px;margin-bottom:10px">Impossible de charger data.json</div>'
        + '<p style="color:var(--color-text-muted)">Cette application est pilotée par les données (<code>data.json</code>). '
        + 'Servez le dossier plutôt que d\'ouvrir le fichier directement :</p>'
        + '<pre style="background:var(--color-background-secondary);padding:12px 14px;border-radius:8px;overflow:auto">'
        + 'python3 -m http.server 8080\n# puis http://localhost:8080/back_office_ws_franchisor.html</pre>'
        + '<p style="color:var(--color-text-muted);font-size:12px">Détail : ' + esc(String(err && err.message || err)) + '</p></div>';
    });
}

/* ----- state ------------------------------------------------------------- */
function setState(patch){
  if (typeof patch === 'function') patch = patch(state);
  Object.assign(state, patch);
  render();
}

/* ----- helpers ----------------------------------------------------------- */
function eur(n){ return Number(n).toLocaleString('fr-BE', { minimumFractionDigits: 0 }) + ' €'; }
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function interp(tmpl, ctx){
  return String(tmpl).replace(/\{(\w+)\}/g, function(_, k){ return ctx[k] !== undefined ? ctx[k] : ''; });
}
/* resolve a palette name (or raw colour) to a usable CSS colour */
function col(name){
  if (name == null || name === '') return 'inherit';
  if (DB.palette && DB.palette[name] !== undefined) return DB.palette[name];
  return name; // raw hex / rgb() / var()
}

function pill(bg, c){
  return 'display:inline-flex;align-items:center;font:600 10px var(--font-ui);border-radius:20px;'
       + 'padding:4px 10px;background:' + col(bg) + ';color:' + col(c);
}
function dotStyle(c){ return 'width:7px;height:7px;border-radius:50%;flex:none;background:' + col(c); }

function flagVal(key, def){ return state.flags[key] !== undefined ? state.flags[key] : def; }
function tog(key, def){
  var on = flagVal(key, def);
  return {
    on: on,
    style: 'position:relative;width:38px;height:21px;border-radius:20px;border:none;cursor:pointer;'
         + 'background:' + (on ? 'var(--color-primary)' : 'var(--color-border-secondary)'),
    knob: 'position:absolute;top:2px;left:' + (on ? '19px' : '2px') + ';width:17px;height:17px;'
        + 'border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)'
  };
}
function flipFlag(key, def){
  setState(function(st){
    var next = {}; next[key] = !flagVal(key, def);
    return { flags: Object.assign({}, st.flags, next) };
  });
}
function printJob(msg){
  setState({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ setState({ toast: '' }); }, 2600);
}

/* shared inline styles (structure only — colours come from tokens) */
var tableBadge = 'display:inline-flex;align-items:center;font:600 11px var(--font-mono);color:var(--color-text-muted);'
               + 'background:var(--color-background-secondary);border-radius:7px;padding:6px 11px';
var pencilStyle = 'background:transparent;border:.5px solid var(--color-border-tertiary);border-radius:7px;cursor:pointer;'
                + 'color:var(--color-text-muted);width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex:none';
var PENCIL_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
               + '<path d="M4 20h3l11-11-3-3L4 17z"/><path d="M14 5l3 3"/></svg>';

/* nav icon paths — lifted verbatim from the WebShop admin bundle's Icon set */
var ICONS = {
  home:      '<path d="M4 21V10l8-6 8 6v11"/><path d="M9 21v-7h6v7"/>',
  shop:      '<path d="M4 9l1.5-4h13L20 9"/><path d="M4 9v11h16V9"/><path d="M9 13h6v7H9z"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 11h6M9 15h4"/>',
  product:   '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/>',
  campaign:  '<path d="M4 12V8a2 2 0 012-2h6l8-3v18l-8-3H6a2 2 0 01-2-2v-2"/><path d="M9 14v5"/>',
  cog:       '<circle cx="12" cy="12" r="3"/><path d="M19 12h2M3 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  mail:      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  user:      '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  bag:       '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 016 0"/>',
  truck:     '<path d="M3 16V7h11v9M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  chart:     '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  clock:     '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  euro:      '<path d="M17 7a6 6 0 100 10"/><path d="M5 10h9M5 14h9"/>'
};
function icon(name, size){
  var d = ICONS[name]; if (!d) return '';
  var s = size || 14;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" style="flex:none">' + d + '</svg>';
}

/* ==========================================================================
   CELL ENGINE — one column descriptor → one grid cell of HTML
   ========================================================================== */
function thresholdColor(v, thresholds, fallback){
  for (var i = 0; i < (thresholds || []).length; i++) {
    if (v >= thresholds[i].min) return thresholds[i].color;
  }
  return fallback;
}
function editVals(colDef, row){
  var vals = {}, map = colDef.map || {};
  Object.keys(map).forEach(function(target){
    var v = row[map[target]];
    if (colDef.strip && colDef.strip.indexOf(target) !== -1) v = String(v).replace(/\s\d+$/, '');
    vals[target] = v;
  });
  return vals;
}

function cell(colDef, row, ctx){
  var a = colDef.align === 'right' ? ';text-align:right' : (colDef.align === 'center' ? '' : '');
  switch (colDef.type) {
    case 'text':      return '<span style="font:500 12.5px var(--font-ui);color:var(--color-text)' + a + '">' + esc(row[colDef.field]) + '</span>';
    case 'textStrong':return '<span style="font:600 12px var(--font-ui);color:var(--color-text)' + a + '">' + esc(row[colDef.field]) + '</span>';
    case 'muted':     return '<span style="font:400 12px var(--font-ui);color:var(--color-text-muted)' + a + '">' + esc(row[colDef.field]) + '</span>';
    case 'mutedSm':   return '<span style="font:400 11.5px var(--font-ui);color:var(--color-text-muted)' + a + '">' + esc(row[colDef.field]) + '</span>';
    case 'mono':      return '<span style="font:600 11.5px var(--font-mono);color:var(--color-text)' + a + '">' + esc(row[colDef.field]) + '</span>';
    case 'monoMuted': return '<span style="font:400 11px var(--font-mono);color:var(--color-text-muted)' + a + '">' + esc(row[colDef.field]) + '</span>';
    case 'nameAccent':
      return '<div style="display:flex;align-items:center;gap:9px">'
        + '<span style="width:10px;height:10px;border-radius:3px;background:' + col(row[colDef.accent]) + ';flex:none"></span>'
        + '<span style="font:500 12.5px var(--font-ui);color:var(--color-text)">' + esc(row[colDef.field]) + '</span></div>';
    case 'euro': {
      var n = row[colDef.field];
      var txt = (colDef.dashIfZero && !n) ? '—' : eur(n);
      return '<span style="font:600 12px var(--font-ui);color:' + col(colDef.color) + ';text-align:right">' + txt + '</span>';
    }
    case 'thresholdText': {
      var v = row[colDef.field];
      var c = thresholdColor(v, colDef.thresholds, colDef['else']);
      return '<span style="font:600 12px var(--font-ui);color:' + col(c) + ';text-align:right">' + esc(v) + esc(colDef.suffix || '') + '</span>';
    }
    case 'pill': {
      var m = colDef.map && colDef.map[row[colDef.field]];
      var st = m || colDef.style || { bg: 'bgSec', fg: 'muted' };
      return '<div style="display:flex;justify-content:' + (colDef.align === 'center' ? 'center' : 'flex-start') + '">'
        + '<span style="' + pill(st.bg, st.fg) + '">' + esc(row[colDef.field]) + '</span></div>';
    }
    case 'pillText': {
      var mm = colDef.map && colDef.map[row[colDef.field]] || { bg: 'bgSec', fg: 'muted' };
      return '<div style="display:flex;align-items:center;gap:7px">'
        + '<span style="' + pill(mm.bg, mm.fg) + '">' + esc(row[colDef.field]) + '</span>'
        + '<span style="font:400 11.5px var(--font-ui);color:var(--color-text-muted)">' + esc(row[colDef.text]) + '</span></div>';
    }
    case 'statePill': {
      var key = interp(colDef.flag, ctx), on = flagVal(key, row[colDef.def]);
      var s = on ? colDef.on : colDef.off;
      return '<div style="display:flex;justify-content:center"><span style="' + pill(s.bg, s.fg) + '">' + esc(s.text) + '</span></div>';
    }
    case 'toggle': {
      var tk = interp(colDef.flag, ctx), t = tog(tk, row[colDef.def]);
      return '<div style="display:flex;justify-content:' + (colDef.align === 'center' ? 'center' : 'flex-start') + '">'
        + '<button data-act="flip" data-key="' + esc(tk) + '" data-def="' + (row[colDef.def] ? 1 : 0) + '" style="' + t.style + '">'
        + '<span style="' + t.knob + '"></span></button></div>';
    }
    case 'edit':
      return '<div style="display:flex;justify-content:flex-end"><button data-act="editRow" data-form="' + esc(colDef.form)
        + '" data-vals="' + esc(JSON.stringify(editVals(colDef, row))) + '" style="' + pencilStyle + '">' + PENCIL_SVG + '</button></div>';
  }
  return '<span></span>';
}

function gridCols(columns){ return columns.map(function(c){ return c.w; }).join(' '); }

function tableHead(columns){
  var cells = columns.map(function(c){
    if (!c.header) return '<span></span>';
    var a = c.align === 'right' ? ' style="text-align:right"' : (c.align === 'center' ? ' style="text-align:center"' : '');
    return '<span class="t-admin-label"' + a + '>' + esc(c.header) + '</span>';
  }).join('');
  return '<div style="display:grid;grid-template-columns:' + gridCols(columns) + ';padding:8px 6px;border-bottom:.5px solid var(--color-border-tertiary)">' + cells + '</div>';
}
function tableRows(columns, rows){
  return rows.map(function(row, i){
    var ctx = { i: i, id: row.id };
    var cells = columns.map(function(c){ return cell(c, row, ctx); }).join('');
    return '<div style="display:grid;grid-template-columns:' + gridCols(columns) + ';align-items:center;padding:11px 6px;border-bottom:.5px solid var(--color-border-tertiary)">' + cells + '</div>';
  }).join('');
}

/* ==========================================================================
   CHROME — sidebar + header, both driven by DB.brand / DB.nav
   ========================================================================== */
/* how many rows a screen lists — shown as a nav count pill (WebShop style) */
function countFor(screen){
  var s = DB.screens[screen];
  if (!s || s.kind === 'dashboard' || s.kind === 'catalogue' || s.kind === 'promos') return '';
  if (s.dataset && Array.isArray(ds(s.dataset))) return ds(s.dataset).length;
  return '';
}

function renderSidebar(){
  var b = DB.brand;
  var blocks = (DB.nav || []).map(function(grp){
    var head = '<div class="admin__nav-group">' + esc(grp.label) + '</div>';
    var items = grp.items.map(function(it){
      var active = state.screen === it.screen ? ' admin__nav-item--active' : '';
      var n = countFor(it.screen);
      var count = n === '' ? '' : '<span class="admin__nav-count">' + n + '</span>';
      return '<a data-act="go" data-screen="' + esc(it.screen) + '" class="admin__nav-item' + active + '">'
        + icon(it.icon) + '<span style="flex:1">' + esc(it.label) + '</span>' + count + '</a>';
    }).join('');
    return head + items;
  }).join('');

  return '<aside class="admin__side">'
    + '<div class="admin__brand">'
    +   '<div class="admin__brand-mark">' + esc(b.mark || 'A') + '</div>'
    +   '<div><div class="admin__brand-name">' + esc(b.name) + '</div>'
    +     '<div class="admin__brand-sub">' + esc(b.consoleLabel) + '</div></div></div>'
    + blocks
    + '</aside>';
}

function renderTopbar(sc){
  var b = DB.brand;
  return '<div class="admin__topbar">'
    + '<div class="admin__breadcrumb"><span>' + esc(b.app) + '</span>'
    +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 6l6 6-6 6"/></svg>'
    +   '<strong>' + esc(sc.title) + '</strong></div>'
    + '<div class="admin__topbar-spacer"></div>'
    + '<span class="admin__topbar-pill">'
    +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
    +   esc(b.date) + '</span>'
    + '<div class="admin__topbar-user" title="' + esc(b.user.name) + ' · ' + esc(b.user.role) + '">' + esc(b.user.initials) + '</div>'
    + '</div>';
}

function renderPageHead(sc){
  return '<div class="page-head">'
    + '<div><h1 class="page-head__title">' + esc(sc.title) + '</h1>'
    +   '<p class="page-head__sub">' + esc(sc.sub) + '</p></div>'
    + '<div class="page-head__actions">' + addBtn(sc.add) + '</div>'
    + '</div>';
}

/* backing-table label row (small mono chip), shown under the page head */
function renderBadgeRow(sc){
  if (!sc.badge) return '';
  var aside = sc.badgeAside ? '<span style="font:400 11px var(--font-ui);color:var(--color-text-muted)">' + esc(sc.badgeAside) + '</span>' : '';
  return '<div style="padding:6px 28px 0;display:flex;justify-content:space-between;align-items:center;gap:12px">'
    + '<span style="' + tableBadge + '">' + esc(sc.badge) + '</span>' + aside + '</div>';
}

/* ----- reusable pieces --------------------------------------------------- */
function card(inner){ return '<div class="card">' + inner + '</div>'; }
function addBtn(add){
  if (!add) return '';
  var cls = add.variant === 'secondary' ? 'btn' : 'btn btn--primary';
  return '<button data-act="openForm" data-key="' + esc(add.form) + '" class="' + cls + '">' + esc(add.label) + '</button>';
}
function ds(name){ return (DB.datasets && DB.datasets[name]) || []; }

/* ==========================================================================
   SCREEN KINDS
   ========================================================================== */
function renderTableScreen(sc){
  var inner = '';
  if (sc.note) inner += '<div style="font:400 11px var(--font-ui);color:var(--color-text-muted);margin-bottom:14px">' + esc(sc.note) + '</div>';
  inner += tableHead(sc.columns) + tableRows(sc.columns, ds(sc.dataset));
  if (sc.footer) inner += '<div style="margin-top:12px;background:var(--color-background-secondary);border-radius:9px;padding:11px 13px;font:400 11px/1.6 var(--font-ui);color:var(--color-text-muted)">' + sc.footer + '</div>';
  return card(inner);
}

function renderDashboard(sc){
  var kpiCards = ds(sc.kpis).map(function(k){
    return '<div class="vstat">'
      + '<div class="vstat__label">' + esc(k.label) + '</div>'
      + '<div class="vstat__value" style="color:' + col(k.valColor) + '">' + esc(k.value) + '</div>'
      + '<div class="vstat__sub" style="color:' + col(k.deltaColor) + '">' + esc(k.delta) + '</div></div>';
  }).join('');
  var t = sc.table;
  var tableCard = card(
    '<div class="t-section-title" style="font-size:15px;margin-bottom:3px">' + esc(t.title) + '</div>'
    + '<div style="font:400 11px var(--font-ui);color:var(--color-text-muted);margin-bottom:14px">' + esc(t.note) + '</div>'
    + tableHead(t.columns) + tableRows(t.columns, ds(t.dataset)));
  return '<div style="display:flex;flex-direction:column;gap:16px">'
    + '<div class="vstats" style="grid-template-columns:repeat(3,1fr);padding:0">' + kpiCards + '</div>'
    + tableCard + '</div>';
}

function renderCatalogue(sc){
  var grid = gridCols(sc.columns);
  var stPill = function(s){ var m = sc.statusMap[s] || { bg: 'bgSec', fg: 'muted' }; return pill(m.bg, m.fg); };
  var body = '';
  ds(sc.dataset).forEach(function(c, ci){
    var ok = 'catO_' + ci, open = flagVal(ok, true);
    var nbWeb = c.prods.filter(function(p, pi){ return flagVal('bw_' + ci + '_' + pi, p.bw); }).length;
    body += '<div data-act="flip" data-key="' + ok + '" data-def="1" style="display:flex;align-items:center;gap:10px;padding:11px 8px;background:var(--color-background-secondary);border-radius:8px;margin-top:8px;cursor:pointer">'
      + '<span style="width:14px;color:var(--color-text-muted);flex:none;font-size:11px">' + (open ? '▾' : '▸') + '</span>'
      + '<span style="font:600 12px var(--font-ui);text-transform:uppercase;letter-spacing:.05em;color:var(--color-text);flex:1">' + esc(c.cat) + '</span>'
      + '<span style="font:400 11px var(--font-ui);color:var(--color-text-muted)">' + c.prods.length + ' produits · ' + nbWeb + ' en ligne</span></div>';
    if (!open) return;
    c.prods.forEach(function(p, pi){
      var bw = tog('bw_' + ci + '_' + pi, p.bw), bm = tog('bm_' + ci + '_' + pi, p.bm);
      var pk = 'prix_' + ci + '_' + pi, pv = flagVal(pk, p.prix);
      var adColor = thresholdColor(p.ad, sc.adThresholds, sc.adElse);
      var saison = p.saison ? '<span style="' + pill(sc.seasonPill.bg, sc.seasonPill.fg) + '">◷ ' + esc(p.saison) + '</span>' : '';
      var editV = { nom: p.nom, cat: c.cat, prix: p.prix };
      body += '<div style="display:grid;grid-template-columns:' + grid + ';align-items:center;padding:10px 6px 10px 22px;border-bottom:.5px solid var(--color-border-tertiary)">'
        + '<div style="display:flex;align-items:center;gap:8px;min-width:0"><span style="font:500 12.5px var(--font-ui);color:var(--color-text)">' + esc(p.nom) + '</span>'
        +   '<span style="' + stPill(p.statut) + '">' + esc(p.statut) + '</span>' + saison + '</div>'
        + '<div style="display:flex;justify-content:flex-end"><input type="number" step="0.01" value="' + esc(pv) + '" data-inp="setFlag" data-key="' + pk + '" '
        +   'style="width:70px;text-align:right;border:.5px solid var(--color-border-secondary);border-radius:7px;padding:6px 7px;font:600 12px var(--font-ui);color:var(--color-text);background:var(--color-surface)"/></div>'
        + '<div style="display:flex;justify-content:center"><button data-act="flip" data-key="bw_' + ci + '_' + pi + '" data-def="' + (p.bw?1:0) + '" style="' + bw.style + '"><span style="' + bw.knob + '"></span></button></div>'
        + '<div style="display:flex;justify-content:center"><button data-act="flip" data-key="bm_' + ci + '_' + pi + '" data-def="' + (p.bm?1:0) + '" style="' + bm.style + '"><span style="' + bm.knob + '"></span></button></div>'
        + '<div style="display:flex;align-items:center;gap:7px"><div style="flex:1;height:7px;background:var(--color-background-secondary);border-radius:5px;overflow:hidden"><div style="width:' + p.ad + '%;height:100%;background:' + col(adColor) + ';border-radius:5px"></div></div>'
        +   '<span style="font:600 10px var(--font-ui);color:var(--color-text-muted);width:30px;text-align:right">' + p.ad + ' %</span></div>'
        + '<div style="display:flex;justify-content:flex-end"><button data-act="editRow" data-form="product" data-vals="' + esc(JSON.stringify(editV)) + '" style="' + pencilStyle + '">' + PENCIL_SVG + '</button></div></div>';
    });
  });
  return card('<div style="font:400 11px/1.5 var(--font-ui);color:var(--color-text-muted);margin-bottom:12px">' + sc.note + '</div>' + tableHead(sc.columns) + body);
}

function renderPromos(sc){
  var v = sc.vouchers, scopeBadge = pill('infoBg', 'info');
  var cards = ds(v.dataset).map(function(x){
    return '<div style="border:.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px 16px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      +   '<span style="font:700 14px var(--font-mono);color:var(--color-primary);letter-spacing:.05em">' + esc(x.code) + '</span>'
      +   '<span style="' + scopeBadge + '">' + esc(v.scopeBadge) + '</span></div>'
      + '<div style="font:500 13px var(--font-ui);color:var(--color-text)">' + esc(x.valeur) + '</div>'
      + '<div style="font:400 11px var(--font-ui);color:var(--color-text-muted);margin-top:2px">' + esc(x.type) + ' · ' + esc(x.validite) + '</div></div>';
  }).join('');
  var p = sc.pricing;
  var pricingCard = card(
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div>'
    + '<div class="t-section-title" style="font-size:15px">' + esc(p.title) + '</div>'
    + '<div style="font:400 11px var(--font-ui);color:var(--color-text-muted)">' + esc(p.note) + '</div></div>' + addBtn(p.add) + '</div>'
    + tableHead(p.columns) + tableRows(p.columns, ds(p.dataset)));
  var vouchersCard = card(
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div>'
    + '<div class="t-section-title" style="font-size:15px">' + esc(v.title) + '</div>'
    + '<div style="font:400 11px var(--font-ui);color:var(--color-text-muted)">' + esc(v.note) + '</div></div>' + addBtn(v.add) + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">' + cards + '</div>');
  return '<div style="display:flex;flex-direction:column;gap:16px">' + vouchersCard + pricingCard + '</div>';
}

function renderParams(sc){
  var head = '<div style="display:grid;grid-template-columns:1.4fr 1.6fr .9fr;padding:8px 6px;border-bottom:.5px solid var(--color-border-tertiary)">'
    + '<span class="t-admin-label">Clé</span><span class="t-admin-label">Valeur</span><span class="t-admin-label" style="text-align:center">Type</span></div>';
  var rows = ds(sc.dataset).map(function(pr, i){
    var valCell;
    if (pr.type === 'bool') {
      var t = tog('param_' + i, pr.def);
      valCell = '<div style="display:flex"><button data-act="flip" data-key="param_' + i + '" data-def="' + (pr.def?1:0) + '" style="' + t.style + '"><span style="' + t.knob + '"></span></button></div>';
    } else {
      var k = 'paramv_' + i, val = flagVal(k, pr.val);
      valCell = '<input type="text" value="' + esc(val) + '" data-inp="setFlag" data-key="' + k + '" '
        + 'style="width:100%;border:.5px solid var(--color-border-secondary);border-radius:7px;padding:7px 9px;font:500 12px var(--font-ui);color:var(--color-text);background:var(--color-surface)"/>';
    }
    return '<div style="display:grid;grid-template-columns:1.4fr 1.6fr .9fr;align-items:center;padding:10px 6px;border-bottom:.5px solid var(--color-border-tertiary)">'
      + '<span style="font:600 11.5px var(--font-mono);color:var(--color-text)">' + esc(pr.cle) + '</span>' + valCell
      + '<span style="font:400 11px var(--font-ui);color:var(--color-text-muted);text-align:center">' + esc(pr.type === 'bool' ? 'bool' : 'text') + '</span></div>';
  }).join('');
  var inner = '<div style="font:400 11px var(--font-ui);color:var(--color-text-muted);margin-bottom:14px">' + esc(sc.note) + '</div>' + head + rows;
  return card(inner);
}

var KINDS = { dashboard: renderDashboard, table: renderTableScreen, catalogue: renderCatalogue, promos: renderPromos, params: renderParams };

/* ==========================================================================
   MODAL — create/edit form, driven by DB.forms
   ========================================================================== */
function formDef(key){ return DB.forms[key]; }
function openForm(key){
  var c = formDef(key), v = {};
  c.fields.forEach(function(f){
    v[f.k] = f.type === 'checks' ? [] : (f.type === 'bool' ? (f.def !== undefined ? f.def : false) : (f.def !== undefined ? f.def : ''));
  });
  setState({ formKey: key, formVals: v, formEdit: false });
}
function editForm(key, vals){
  var c = formDef(key), v = {};
  c.fields.forEach(function(f){
    if (f.type === 'checks') v[f.k] = (vals && Array.isArray(vals[f.k])) ? vals[f.k] : [];
    else if (f.type === 'bool') v[f.k] = (vals && vals[f.k] !== undefined) ? vals[f.k] : (f.def !== undefined ? f.def : false);
    else v[f.k] = (vals && vals[f.k] !== undefined && vals[f.k] !== '') ? vals[f.k] : (f.def !== undefined ? f.def : '');
  });
  setState({ formKey: key, formVals: v, formEdit: true });
}
function closeForm(){ setState({ formKey: null }); }
function submitForm(){
  var c = formDef(state.formKey); if (!c) return;
  var ed = state.formEdit; setState({ formKey: null });
  printJob((ed ? '✔ Mis à jour dans ' : '✔ Enregistré dans ') + c.table);
}
function flipFormBool(k){ setState(function(st){ var fv = Object.assign({}, st.formVals); fv[k] = !fv[k]; return { formVals: fv }; }); }
function toggleFormCheck(k, opt){
  setState(function(st){
    var cur = Array.isArray(st.formVals[k]) ? st.formVals[k].slice() : [];
    var i = cur.indexOf(opt); if (i === -1) cur.push(opt); else cur.splice(i, 1);
    var fv = Object.assign({}, st.formVals); fv[k] = cur; return { formVals: fv };
  });
}
function renderModal(){
  if (!state.formKey) return '';
  var c = formDef(state.formKey);
  var inputBase = 'width:100%;padding:11px 12px;border:.5px solid var(--color-border-secondary);border-radius:9px;'
    + 'font:400 13px var(--font-ui);color:var(--color-text);background:var(--color-surface);box-sizing:border-box';
  var areaStyle = inputBase + ';min-height:96px;resize:vertical;font-family:var(--font-ui)';
  var fields = c.fields.map(function(f){
    var val = state.formVals[f.k] !== undefined ? state.formVals[f.k] : '';
    var inner;
    if (f.type === 'select') {
      inner = '<select data-inp="formField" data-k="' + f.k + '" style="' + inputBase + '">'
        + (f.options || []).map(function(o){ return '<option value="' + esc(o) + '"' + (String(val) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('')
        + '</select>';
    } else if (f.type === 'number') {
      inner = '<input type="number" value="' + esc(val) + '" data-inp="formField" data-k="' + f.k + '" style="' + inputBase + '"/>';
    } else if (f.type === 'area') {
      inner = '<textarea data-inp="formField" data-k="' + f.k + '" placeholder="' + esc(f.ph || '') + '" style="' + areaStyle + '">' + esc(val) + '</textarea>';
    } else if (f.type === 'checks') {
      var arr = Array.isArray(val) ? val : [];
      inner = '<div style="display:flex;flex-wrap:wrap;gap:7px">' + (f.options || []).map(function(o){
        var on = arr.indexOf(o) !== -1;
        var st = 'border:none;cursor:pointer;border-radius:20px;padding:7px 13px;font:600 11.5px var(--font-ui);'
          + (on ? 'background:var(--color-primary);color:#fff' : 'background:var(--color-background-secondary);color:var(--color-text-muted)');
        return '<button data-act="formCheck" data-k="' + f.k + '" data-opt="' + esc(o) + '" style="' + st + '">' + esc(o) + '</button>';
      }).join('') + '</div>';
    } else if (f.type === 'bool') {
      var bOn = !!val;
      var bStyle = 'position:relative;width:44px;height:24px;border-radius:20px;border:none;cursor:pointer;background:' + (bOn ? 'var(--color-primary)' : 'var(--color-border-secondary)');
      var bKnob = 'position:absolute;top:2px;left:' + (bOn ? '22px' : '2px') + ';width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)';
      inner = '<button data-act="formBool" data-k="' + f.k + '" style="' + bStyle + '"><span style="' + bKnob + '"></span></button>';
    } else {
      inner = '<input type="text" value="' + esc(val) + '" placeholder="' + esc(f.ph || '') + '" data-inp="formField" data-k="' + f.k + '" style="' + inputBase + '"/>';
    }
    return '<div><label style="display:block;font:600 11px var(--font-ui);letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:6px">' + esc(f.label) + '</label>' + inner + '</div>';
  }).join('');
  return '<div data-act="formClose" style="position:fixed;inset:0;background:rgba(34,34,34,.42);display:flex;align-items:center;justify-content:center;z-index:2100;padding:24px">'
    + '<div data-stop="1" style="background:var(--color-surface);border-radius:14px;width:490px;max-width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
    +   '<div style="padding:20px 24px 16px;border-bottom:.5px solid var(--color-border-tertiary);display:flex;justify-content:space-between;align-items:start">'
    +     '<div style="min-width:0"><div class="t-page-title" style="font-size:18px">' + esc(c.title) + '</div>'
    +       '<div style="display:inline-flex;align-items:center;gap:6px;margin-top:6px;background:var(--color-background-secondary);border-radius:6px;padding:4px 9px">'
    +         '<span style="font:600 11px var(--font-mono);color:var(--color-text-muted)">' + esc(c.table) + '</span></div></div>'
    +     '<button data-act="formClose" style="background:transparent;border:none;cursor:pointer;color:var(--color-text-muted);font-size:22px;line-height:1;padding:0">×</button></div>'
    +   '<div style="padding:18px 24px;display:flex;flex-direction:column;gap:14px">' + fields + '</div>'
    +   '<div style="padding:14px 24px 20px;border-top:.5px solid var(--color-border-tertiary);display:flex;gap:10px">'
    +     '<button data-act="formClose" class="btn" style="flex:1;justify-content:center">Annuler</button>'
    +     '<button data-act="formSubmit" class="btn btn--primary" style="flex:2;justify-content:center">' + esc(c.save) + '</button></div>'
    + '</div></div>';
}
function renderToast(){
  if (!state.toast) return '';
  return '<div class="toast">' + esc(state.toast) + '</div>';
}

/* ==========================================================================
   MAIN RENDER — WebShop admin shell: sidebar + topbar + page-head + content
   ========================================================================== */
function render(){
  if (!DB) return;
  var sc = DB.screens[state.screen] || DB.screens[DB.defaultScreen];
  var main = (KINDS[sc.kind] || renderTableScreen)(sc);
  document.getElementById('app').innerHTML =
    '<div class="admin">'
    + renderSidebar()
    + '<div class="admin__main">'
    +   renderTopbar(sc)
    +   '<div class="admin__scroll lz">'
    +     renderPageHead(sc)
    +     renderBadgeRow(sc)
    +     '<div class="admin__content">' + main + '</div>'
    +   '</div>'
    + '</div>' + renderToast() + renderModal() + '</div>';
}

/* ==========================================================================
   EVENTS — one click + one input listener for the whole app
   ========================================================================== */
function findAct(el){
  while (el && el !== document.body) {
    if (el.getAttribute) {
      if (el.getAttribute('data-act')) return el;
      if (el.getAttribute('data-stop')) return null; // dialog dead-space: don't reach backdrop
    }
    el = el.parentNode;
  }
  return null;
}
document.addEventListener('click', function(e){
  var el = findAct(e.target); if (!el) return;
  switch (el.getAttribute('data-act')) {
    case 'go':        setState({ screen: el.getAttribute('data-screen') }); break;
    case 'navToggle': setState(function(st){ return { paramNavOpen: !st.paramNavOpen }; }); break;
    case 'flip':      flipFlag(el.getAttribute('data-key'), el.getAttribute('data-def') === '1'); break;
    case 'openForm':  openForm(el.getAttribute('data-key')); break;
    case 'editRow':   editForm(el.getAttribute('data-form'), JSON.parse(el.getAttribute('data-vals') || '{}')); break;
    case 'formClose': closeForm(); break;
    case 'formSubmit':submitForm(); break;
    case 'formBool':  flipFormBool(el.getAttribute('data-k')); break;
    case 'formCheck': toggleFormCheck(el.getAttribute('data-k'), el.getAttribute('data-opt')); break;
  }
});
document.addEventListener('input', function(e){
  var el = e.target, inp = el.getAttribute && el.getAttribute('data-inp');
  if (!inp) return;
  // in-place update WITHOUT a re-render, so the focused field keeps focus/caret
  if (inp === 'setFlag') { state.flags = Object.assign({}, state.flags); state.flags[el.getAttribute('data-key')] = el.value; }
  else if (inp === 'formField') { state.formVals = Object.assign({}, state.formVals); state.formVals[el.getAttribute('data-k')] = el.value; }
});

/* ----- go ---------------------------------------------------------------- */
boot();
