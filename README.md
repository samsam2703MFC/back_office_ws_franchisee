# back_office_ws_franchisee

**Console franchisé** — the store-manager back-office for the **L'Atelier By**
webshop. Aligned with `back_office_ws_franchisor`: same **data-driven**
architecture and the **WebShop admin** look (Gotham + Vank fonts,
`admin.css` + `admin-app.css`), deployed the same way.

## Running

The app fetches `data.json` at startup, so serve the folder over HTTP:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080/back_office_ws_franchisee.html
```

No build step, no external runtime.

## Architecture — identical to the franchisor

- **`data.json`** — the presentation config + **seed**: theme, brand, navigation,
  per-screen column schemas, form definitions, and a seed for every dataset.
- **`api-config.js`** — resolves the shared API (`window.__FR = {base, token,
  shop}`): same-origin `<origin>/webshop/api`, `X-Admin-Token` from
  `localStorage['adminToken']`, shop scope via `?shop=<slug>`. Mirror of the
  franchisor's `api-config.js`.
- **`bo_data.js`** — data-access layer (`BOData.hydrate(DB)`): replaces each
  dataset with the real API data (`GET <base>/franchisee/<seg>`), **seed-fallback
  per dataset** (empty/error/401 → keep seed, never breaks). Mirror of the
  franchisor's `bo_server.js`.
- **`app.js`** — generic render engine (fetches `data.json`, applies the theme,
  hydrates via `BOData` before the first render, renders each screen from its
  config). Zero domain data. Same engine as `back_office_ws_franchisor`.
- **`admin.css` + `admin-app.css` + `fonts/`** — the WebShop admin stylesheets
  and brand fonts, vendored verbatim, loaded in the same order as the WebShop
  admin so the look matches.

Backend: read endpoints `GET /franchisee/*` in the WebShop `php-api` (guarded by
`X-Admin-Token`), see `MIGRATION_NOTES.md` and `AUDIT_HARDCODE.md`.

## Screens (store-manager scope)

| Group | Screen | Backing tables (labelled in-UI) |
| --- | --- | --- |
| **Exploitation** | Tableau de bord (KPIs + commandes du jour) | ws_orders |
| | Commandes du jour | ws_orders ← webshop |
| | Stock du jour | ws_stock |
| | Demandes B2B | ws_office_requests |
| | Incidents & litiges | bo_incidents |
| **Analytique** | Rentabilité (marge, coûts, CA/km) | — |
| **Paramétrage** | Horaires des tournées | ws_tour_schedules |
| | Frais de livraison | ws_delivery_fees |
| | Bureaux (B2B) | ws_offices · bo_office_users |

Interactions: sidebar nav with icons + count pills, live toggles, and a
create/edit modal (text / number / select) with a confirmation toast — the
same engine as the franchisor.

> Map-heavy / drag-drop screens of the original franchisee composition (live
> delivery tracking, tournée builder, capacity calendar) are out of scope for
> this data-driven table/card port; they can be added later if needed.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) deploys over SSH/rsync on every
push to `main` — same mechanism and secrets as the franchisor — to the path
served at `/webshop/backoffice_franchisee`. The workflow verifies the served
page and that all fonts return `200`.

## Files

- `back_office_ws_franchisee.html` — page shell + tokens (loads `admin.css` + `admin-app.css`, then `api-config.js` → `bo_data.js` → `app.js`)
- `data.json` — presentation config + seed (fallback)
- `api-config.js` — API base + admin token + shop scope (`window.__FR`)
- `bo_data.js` — data layer: hydrate datasets from `/franchisee/*` (seed fallback)
- `app.js` — generic render engine (no domain data)
- `admin.css`, `admin-app.css`, `fonts/` — WebShop admin styling
- `img/logo.png` — L'Atelier By wordmark
