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

## Architecture — identical to the franchisor

- **`back_office_ws_franchisee.dc.html`** — the pristine Claude Design export
  (template `<x-dc>` + `class Component extends DCLogic`).
- **`index.html`** — the deployed page: same export, with the boot wired for
  production — vendored React (`window.__resources`), `api-config.js`, and
  `BOServer.hydrate()` executed **before** the runtime boots.
- **`support.js`** — the Claude Design DC runtime (byte-identical to the
  franchisor's).
- **`bo_server.js`** — data layer: every domain table lives here as the seed,
  is persisted to `localStorage`, and is read by the page via
  `window.BOServer.table(name)`. `hydrate()` fetches the real API
  (`<origin>/webshop/api/franchisee/*`, header `X-Admin-Token`, scope
  `?shop=<slug|id>`) into memory **per table with seed fallback** — a missing
  endpoint/table never breaks the render.
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
