# back_office_ws_franchisee

**Console franchisé** — the store-manager back-office for the **L'Atelier By**
webshop. This is the Claude Design export (`back_office_ws_franchisee.dc.html`)
run **natively**, with the same architecture as `back_office_ws_franchisor`:
DC runtime (`support.js`) + server-simulation data layer (`bo_server.js`) +
the **L'Atelier design system** (`_ds/…/global.css`, Gotham + Vank + Playwrite
fonts) + vendored React.

## Running

```bash
python3 -m http.server 8080
# then visit http://localhost:8080/            (index.html)
# pristine export: http://localhost:8080/back_office_ws_franchisee.dc.html
```

No build step. Serve over HTTP (not `file://`).

## Addressing — one URL per section

Every section of the nav has its own address: the fragment is the screen's own
name, appended to the page URL, with the shop scope preserved.

```
https://<host>/webshop/backoffice_franchisee/?shop=2#tournees
                                                    ^^^^^^^^^ the section
```

Opening such a link goes straight to that section (and unfolds its
**Paramétrage** group so the nav shows where you are); clicking in the nav
updates the address, so **Back / Forward** and **bookmarks** work, and a reload
stays put. Hovering a nav entry shows that section's full address without
having to go there first, and the deep-search results list each screen's
fragment next to its path.

An unknown fragment is **not** followed — it would open an empty screen under a
false address. The address is corrected to the screen actually displayed.
Addresses never carry `?token=` (or `pin`/`secret`/`key`/`pass`): they are meant
to be shown, hovered and pasted.

## Onboarding — « Bien démarrer » (`#onboarding`)

The franchisee's guide lives in the console itself (section **Aide** of the
nav): how the webshop works for their customers, their day screen by screen,
the tools to grow the business, the companion apps, and **what changes in each
version**. It opens by itself on a browser's first visit, and the nav entry
carries a **Nouveau** badge whenever a newer guide version has not been opened
yet. Content, version number and release notes are in the page script
(`ONB_VERSION`, `ONB_NOTES`, `onbChapters()`); the update procedure is in
[`docs/ONBOARDING.md`](docs/ONBOARDING.md). A printable version — brand CSS and
fonts, logo, screenshots — is generated from the page by
`docs/onboarding/build-pdf.cjs` (or the **Guide du franchisé (PDF)** workflow):
[`docs/onboarding/guide-franchise.pdf`](docs/onboarding/guide-franchise.pdf).

## Architecture — identical to the franchisor

- **`back_office_ws_franchisee.dc.html`** — the pristine Claude Design export
  (template `<x-dc>` + `class Component extends DCLogic`).
- **`index.html`** — the deployed page: same export, with the boot wired for
  production — vendored React (`window.__resources`), `api-config.js`, and
  `BOServer.hydrate()` executed **before** the runtime boots.
- **`support.js`** — the Claude Design DC runtime (byte-identical to the
  franchisor's).
- **`bo_server.js`** — data layer: **no seed, no fallback**. Every domain table
  is read by the page via `window.BOServer.table(name)` and filled only by
  `hydrate()`, which fetches the real API (`<origin>/webshop/api/franchisee/*`,
  header `X-Admin-Token`, scope `?shop=<slug|id>`) into memory. A table the
  server does not serve stays **empty**, and the screen shows nothing rather
  than something invented. Local edits (`BOServer.save`) live in `localStorage`
  until the server acknowledges them; older stores are purged at load.
- **`api-config.js`** — same-origin API resolution + admin token shared per
  origin (`localStorage.adminToken`) + shop scope; overrides `?api=`, `?token=`,
  `?shop=`.
- **`_ds/l-atelier-by-…/`** — design system: `global.css` (tokens + components)
  and the brand fonts (Gotham 9-weight ladder, Vank, Playwrite DEVA).
- **`vendor/react.js` / `vendor/react-dom.js`** — React 18.3.1 UMD, vendored.
- Leaflet (live-tracking map) is loaded from unpkg + OpenStreetMap tiles
  (needs internet — same as any map).

## Data — tables read by the page (hydrated from `/franchisee/*`)

`fr_clients` · `ws_offices` · `ws_office_delivery_sites` · `ws_office_emails` ·
`b2b_client_company_department` · `ws_tours` · `ws_delivery_zones` ·
`ws_franchisor_catchment` · `ws_vouchers_local` — plus the form-backed tables
(`ws_tour_availability`, `ws_tour_closures`, `ws_calendar_rules`, `ws_slots`,
`ws_shop_exceptions`, `ws_pricing_rules_local`, `ws_delivery_fee_rules`,
`ws_office_delivery_settings`, `ws_product_availability`, `ws_payment_methods`,
`params`, …). Endpoint ↔ table map in `MIGRATION_NOTES.md`. Writes
(`BOServer.save`) stay local (`localStorage`) — server writes are the next
increment, same as the franchisor.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) deploys over SSH/rsync on every
push to `main` — same mechanism and secrets as the franchisor — to the path
served at `/webshop/backoffice_franchisee`, and verifies the served page and
all fonts return `200`.
