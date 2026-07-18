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

- **`data.json`** — the single source of truth: theme, brand, navigation,
  per-screen column schemas, every dataset, and form definitions.
- **`app.js`** — generic render engine (fetches `data.json`, applies the theme
  to `:root`, renders each screen from its config). Zero domain data. Same
  engine as `back_office_ws_franchisor`.
- **`admin.css` + `admin-app.css` + `fonts/`** — the WebShop admin stylesheets
  and brand fonts, vendored verbatim, loaded in the same order as the WebShop
  admin so the look matches.

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

- `back_office_ws_franchisee.html` — page shell + tokens (loads `admin.css` + `admin-app.css`)
- `data.json` — all data & configuration
- `app.js` — generic render engine (no domain data)
- `admin.css`, `admin-app.css`, `fonts/` — WebShop admin styling
- `img/logo.png` — L'Atelier By wordmark
