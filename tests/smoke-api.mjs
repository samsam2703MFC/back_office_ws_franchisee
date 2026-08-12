#!/usr/bin/env node
/* =============================================================================
   smoke-api.mjs — vérification automatique de l'API, sans navigateur.
   =============================================================================
   Rejoue en quelques secondes ce qu'on vérifiait à la main : ajustement de
   stock, cycle de statut d'une commande, moyens de paiement selon le mode,
   frais de livraison de part et d'autre du seuil, bons disponibles.

   Aucune dépendance : Node 18+ suffit (fetch est natif).

   USAGE
     node tests/smoke-api.mjs --base http://185.180.206.46/webshop/api \
                              --shop 2 --token <jeton admin ERP>

     # ou par variables d'environnement
     WS_BASE=… WS_SHOP=2 WS_TOKEN=… node tests/smoke-api.mjs

   CE QUE LE SCRIPT NE FAIT PAS
     Il ne teste QUE le serveur. Les défauts d'interface — un champ qui affiche
     une valeur sans l'enregistrer, un bouton caché, un filtre de date qui
     exclut le dernier jour du mois — lui échappent par construction : le
     serveur, lui, répondait correctement. Pour ceux-là, voir e2e-bo.spec.mjs.

   Il n'écrit QUE sur le stock, et remet la valeur d'origine en fin de course.
   Le cycle de statut n'est joué que si --ref est fourni : il modifie une vraie
   commande.
============================================================================= */

const argv = process.argv.slice(2);
const arg = (n, def) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : def; };

const BASE  = (arg('base',  process.env.WS_BASE)  || '').replace(/\/$/, '');
const SHOP  =  arg('shop',  process.env.WS_SHOP)  || '';
const TOKEN =  arg('token', process.env.WS_TOKEN) || '';
const REF   =  arg('ref',   process.env.WS_REF)   || '';        // optionnel
const PROD  = +(arg('product', process.env.WS_PRODUCT) || 6700230);

if (!BASE || !SHOP || !TOKEN) {
  console.error('Usage : node tests/smoke-api.mjs --base <url/api> --shop <id> --token <jeton admin> [--ref <WS-…>] [--product <id>]');
  process.exit(2);
}

const H = { 'Content-Type': 'application/json', 'X-Admin-Token': TOKEN };
let pass = 0, fail = 0;

const ok   = (m, d) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m + (d ? '  ' + d : '')); };
const ko   = (m, d) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m + (d ? '\n      ' + d : '')); };
const head = (t)    => console.log('\n\x1b[1m' + t + '\x1b[0m');

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { headers: H, ...opts });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (_) {}
  return { status: r.status, ok: r.ok, json: j, text: txt.slice(0, 300) };
}

/* ── 1. Le socle : l'API répond et reconnaît le jeton ───────────────────── */
async function testAuth() {
  head('1 · Authentification et portée boutique');
  const r = await api(`/franchisee/me?shop=${SHOP}`);
  if (r.status === 401) return ko('jeton refusé (401)', 'Vérifie --token : c\'est le jeton admin ERP.');
  if (!r.ok)            return ko(`/franchisee/me a répondu ${r.status}`, r.text);
  ok('jeton accepté, boutique jointe');
}

/* ── 2. Stock : l'ajustement écrit VRAIMENT, et ne descend pas sous zéro ── */
async function testStock() {
  head('2 · Ajustement de stock');
  const before = await api(`/franchisee/fr-stock-catalog?shop=${SHOP}`);
  if (!before.ok) return ko('catalogue stock illisible', before.text);

  const up = await api(`/franchisee/stock-adjust?shop=${SHOP}`, {
    method: 'POST', body: JSON.stringify({ productId: PROD, mode: 'collect', delta: +3 }),
  });
  if (!up.ok || !up.json?.ok) return ko('ajustement +3 refusé', up.json?.error || up.text);
  const total3 = up.json.total;
  ok('ajustement +3 accepté', `total=${total3} dispo=${up.json.dispo}`);

  // Plancher : un stock négatif fausserait toute la disponibilité en aval.
  const down = await api(`/franchisee/stock-adjust?shop=${SHOP}`, {
    method: 'POST', body: JSON.stringify({ productId: PROD, mode: 'collect', delta: -100000 }),
  });
  if (!down.ok || !down.json?.ok)      ko('ajustement massif refusé', down.json?.error || down.text);
  else if (down.json.total !== 0)      ko('le stock est descendu sous zéro', `total=${down.json.total}`);
  else                                 ok('plancher à zéro respecté');

  // Remise en état : on rend le stock tel qu'on l'a trouvé.
  const back = await api(`/franchisee/stock-adjust?shop=${SHOP}`, {
    method: 'POST', body: JSON.stringify({ productId: PROD, mode: 'collect', delta: total3 - 3 }),
  });
  if (back.ok && back.json?.ok) ok('stock remis à sa valeur initiale', `total=${back.json.total}`);
  else                          ko('REMISE EN ÉTAT ÉCHOUÉE — vérifie le stock à la main', back.text);
}

/* ── 3. Paiement : « en boutique » n'a pas de sens sur une livraison ────── */
async function testPaymentModes() {
  head('3 · Moyens de paiement selon le mode');
  const col = await api(`/payment-methods?shopId=${SHOP}&profile=registered&mode=collect`);
  const del = await api(`/payment-methods?shopId=${SHOP}&profile=registered&mode=delivery`);
  const ids = (r) => (Array.isArray(r.json) ? r.json.map((x) => x.method) : []);

  if (!col.ok || !del.ok) return ko('/payment-methods illisible', col.text || del.text);
  ok('collect', ids(col).join(', ') || '(aucun)');

  if (ids(del).includes('shop')) ko('« paiement en boutique » proposé sur une LIVRAISON',
                                    'Le client ne vient jamais en boutique : personne n\'encaisse.');
  else                           ok('livraison : paiement en boutique correctement écarté', ids(del).join(', ') || '(aucun)');
}

/* ── 4. Frais de livraison : l'aperçu doit dire ce qui sera facturé ─────── */
async function testDeliveryFees() {
  head('4 · Devis de frais de livraison');
  const q = async (subtotal) => api('/delivery-fees/quote', {
    method: 'POST', body: JSON.stringify({ shopId: +SHOP, subtotal }),
  });
  const low = await q(1), high = await q(100000);
  if (!low.ok) return ko('/delivery-fees/quote illisible', low.text);
  if (low.json === null) return ok('aucune règle de frais configurée (rien à vérifier)');

  const need = ['fee_amount', 'free_delivery', 'free_delivery_minimum', 'payment_type', 'resolved_level'];
  const miss = need.filter((k) => !(k in (low.json || {})));
  if (miss.length) ko('le devis ne renvoie pas le contrat attendu', 'clés manquantes : ' + miss.join(', '));
  else             ok('contrat du devis respecté', `niveau=${low.json.resolved_level}`);

  if (high.json && high.json.free_delivery !== true)
    ko('au-dessus du seuil, la livraison n\'est pas offerte', `seuil=${low.json.free_delivery_minimum}`);
  else ok('seuil de gratuité appliqué', `dès ${low.json.free_delivery_minimum} €`);
}

/* ── 5. Cycle de statut — seulement si une référence est fournie ────────── */
async function testOrderCycle() {
  if (!REF) { head('5 · Cycle de statut'); console.log('  (ignoré : passe --ref <WS-…> pour le jouer)'); return; }
  head(`5 · Cycle de statut sur ${REF}`);
  for (const st of ['confirmed', 'preparing', 'ready', 'in_delivery', 'delivered']) {
    const r = await api(`/franchisee/order-status?shop=${SHOP}`, {
      method: 'POST', body: JSON.stringify({ ref: REF, status: st }),
    });
    if (r.ok && r.json?.ok) ok(st);
    else                    ko(st, r.json?.error || r.text);
  }
}

/* ── 6. Bons disponibles ────────────────────────────────────────────────── */
async function testVouchers() {
  head('6 · Bons disponibles');
  const r = await api(`/vouchers/available?shopId=${SHOP}&subtotal=50`);
  if (!r.ok) return ko('/vouchers/available illisible', r.text);
  const list = Array.isArray(r.json) ? r.json : [];
  ok(`${list.length} bon(s) exposé(s)`, list.map((v) => v.code).join(', '));
}

(async () => {
  console.log(`\nAPI  : ${BASE}\nShop : ${SHOP}`);
  try {
    await testAuth();
    await testStock();
    await testPaymentModes();
    await testDeliveryFees();
    await testOrderCycle();
    await testVouchers();
  } catch (e) {
    ko('exception non rattrapée', e && e.stack ? e.stack : String(e));
  }
  console.log(`\n\x1b[1mRésultat\x1b[0m : ${pass} ok, ${fail} en échec\n`);
  process.exit(fail ? 1 : 0);
})();
