# Kaviari Cellar

Inventory, consumption, purchasing and marketing for a premium seafood
business sourcing caviar from [Kaviari, Paris](https://www.kaviari.fr).
Built with Next.js (App Router), TypeScript, Tailwind CSS, Prisma + SQLite,
Recharts and the Anthropic API.

## Quick start

```bash
npm install
cp .env.example .env        # then edit if needed
npm run setup               # prisma db push + seed demo data
npm run dev                 # http://localhost:3000
```

Then open **/register** and create the owner account: any registration
with the `OWNER_EMAIL` address (default
`fabien@thammachartseafood.com`) is approved automatically and gets the
**owner** role. Everyone else lands in a **pending** state until the
owner approves them — by one-click email link (if SMTP is configured) or
from **Settings → Users**.

The seed loads the product database extracted from
`data/Data_base_products.xlsx` (85 products: caviar, marketing tools,
fish roe, crab and fish — each with its PR code, category, unit, packing
per box, tin size and **real purchase cost** from the workbook's Cost
sheet) plus one opening stock lot per product matching the current
on-hand. **There is no demo data**: consumption, purchase orders,
forecasts and campaigns all start empty and fill up as the team logs
real activity.

## Units: tins first, kg as reference

All quantities in the app are expressed in **units (tins / pieces)** —
that is how stock is counted, consumed and ordered. Where a product has
a known tin size (`gramsPerUnit`), the kg equivalent is shown alongside
as a reference only. Sales channels are **Food service**, **Event** and
**Training**.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite database file (Prisma) |
| `APP_URL` | `http://localhost:3000` | Public URL, used in approval-email links |
| `APP_SECRET` | dev fallback | HMAC key for session cookies and approval links — change in production |
| `OWNER_EMAIL` | `fabien@thammachartseafood.com` | Registrations with this email become the owner (auto-approved) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | _empty_ | Optional — emails the owner an approve/reject link when someone requests access. Without SMTP, approvals happen in Settings → Users. |
| `ANTHROPIC_API_KEY` | _empty_ | Enables the assistant, import analysis, PO upload parsing and content studio. **The app fully works without it** — AI surfaces show a friendly notice instead. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Optional model override |

## Accounts & access control

- **Registration required.** New users sign up at `/register` with
  email + password; their account is created in `pending` status.
- **Owner approval.** With SMTP configured, the owner receives an email
  with signed one-click **Approve / Reject** links. Either way, pending
  requests can be handled in **Settings → Users**.
- **Roles.** The owner (matched by `OWNER_EMAIL`) is the only role that
  can open **Settings** (policy parameters, user management). Approved
  members get everything else.
- Sessions are HMAC-signed cookies; passwords are scrypt-hashed.

## How the ordering formula works

The Order Planner implements a **periodic-review (R, S) policy** — the
standard replenishment model for a fixed ordering rhythm with a long lead
time. All parameters are editable in **Settings**.

| Parameter | Default | Meaning |
|---|---|---|
| Review period **R** | 15 days | One order is placed every R days |
| Lead time **L** | 21 days | Order → goods received |
| Safety stock | 15 days | Extra coverage against demand spikes / delays |
| ADU window | 42 days | Trailing window for average daily usage |

For each product (all quantities in **units**, i.e. tins or pieces):

```
ADU  = units consumed in the last 42 days / 42     (or the manual override)
S    = ADU × (L + R + safety) = ADU × 51 days      (order-up-to level)

suggested units = max(0, S − on-hand units − on-order units)
ordered units   = suggested units rounded UP to full boxes
                  (packing per box comes from the product database)
```

**On-order includes every open PO (status sent or confirmed).** Because
the lead time (21 d) is longer than the review period (15 d), there is
always at least one order still in transit when the next review comes
around; counting that pipeline stock in the inventory position is what
prevents systematic double-ordering. `tests/replenishment.test.ts` covers
exactly this case, plus the box-rounding rules.

Marking a PO **sent** stamps `lastOrderDate`, which starts the next
15-day countdown shown on the dashboard and planner.

Consumption is drawn **FEFO** (first-expired-first-out): logging usage
allocates tins from the lot with the soonest DLC automatically, and lots
expiring within 14 days raise alerts with a one-click "push to marketing"
promo shortcut.

## Purchase orders

- The **Order Planner** filters by product category (Caviar, Marketing
  tools…), shows suggested quantities in units **and** boxes, and
  exports a draft PO as a styled Excel file (product code, description,
  number of tins — box-rounded).
- **AI order recommendation**: one click produces a prioritized order
  plan — references to order now, references to order soon, references
  to monitor — with PR codes, descriptions, box-rounded quantities and
  a short reason per line, based on stock, pipeline, consumption and
  the team's forecasts.
- On the **Purchase Orders** page you can **upload the PO you actually
  sent to the supplier** (drag & drop, Excel or PDF): the AI reads it
  **line by line** (duplicates are never merged) and pre-fills the
  reference, lines and quantities, which you can edit before saving.

## Assistant & reports

Each user has their **own private chats** with the Caviar Assistant
(create, rename, keep or delete conversations — history is stored per
account). The **Reports** button generates a detailed professional
report (inventory status, consumption & forecasts, or order planning)
as a themed, print-ready HTML document.

## Consumption analysis & forecasts

**Consume → Analysis** offers a filterable view (week/month, by caviar
type, comparison between types, per person, consumption vs forecast)
with a mini-dashboard that adapts to the filters, a styled Excel export
of the current view, and a **forecast template** you can download, fill
in per person and re-upload — the global forecast is the sum of each
person's forecasts.

## Replacing the demo data

1. Put your own product database in `data/` and re-run
   `python3 data/extract_products_db.py <file.xlsx>` (adjust the script's
   sheet/column mapping to your file), or simply edit
   `data/products_db.json` / `data/consumption_history.json` by hand.
2. Re-seed: `npm run db:seed` (reloads the catalog and demo movements —
   **user accounts are preserved**).
3. Or skip seeding and import a supplier price list through
   **Import & Analyze** — the AI maps your columns to the catalog and asks
   for confirmation before writing.

> **Note on prices:** the source workbook contains no unit costs, so the
> seeded `unitCost` values are estimates from typical Kaviari wholesale
> price points. Replace them via Import & Analyze or the product editor.

## Deploying to Railway

The repo ships Railway-ready (`railway.json` + a `start:railway` script
that applies the schema and seeds the demo data on first boot only).

1. Sign in at [railway.com](https://railway.com) with GitHub and create a
   **New Project → Deploy from GitHub repo → FabCler/Kaviari**.
2. In the service **Settings → Source**, set the branch to deploy.
3. Right-click the service → **Attach Volume**, mount path **`/data`**
   (this is where the SQLite database lives, so it survives restarts).
4. In **Variables**, add:
   - `DATABASE_URL` = `file:/data/kaviari.db`
   - `APP_SECRET` = a long random string
   - `APP_URL` = your public Railway URL (after generating the domain)
   - `OWNER_EMAIL` = the owner's email (defaults to
     `fabien@thammachartseafood.com`)
   - `SMTP_*` = optional, for approval emails
   - `ANTHROPIC_API_KEY` = your key (optional — enables the AI features)
5. Deploy, then **Settings → Networking → Generate Domain** for your
   public URL (and put it in `APP_URL`).

First boot seeds the demo data automatically; the seed re-runs only when
the shipped catalog version changes, and **never touches user accounts**.
To start from a clean slate, delete `/data/kaviari.db` (or the volume)
and redeploy.

## Switching to Postgres

The schema avoids SQLite-only features (enums are validated strings — see
`lib/domain.ts`):

1. In `prisma/schema.prisma` set `provider = "postgresql"`.
2. Point `DATABASE_URL` at your server.
3. `npx prisma db push && npm run db:seed`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm test` | Vitest unit tests (replenishment math, box rounding, FEFO) |
| `npm run db:push` | Apply schema to the database |
| `npm run db:seed` | Reseed catalog + demo data (keeps user accounts) |
| `npm run setup` | push + seed in one go |

## Project layout

```
app/(app)/          screens (dashboard, inventory, consume + analysis,
                    planner, purchase-orders, import, marketing,
                    assistant, settings)
app/api/            route handlers (zod-validated, session-gated)
app/login,register  account screens (public)
components/ui/      shadcn-style primitives (Radix + Tailwind v4)
lib/                domain logic: replenishment.ts (R,S math in units),
                    fefo.ts, stock.ts, planner.ts, settings.ts, ai.ts,
                    auth.ts (accounts), email.ts (approval emails)
prisma/             schema + seed
data/               product database + consumption history + extractor
tests/              vitest unit tests
```
