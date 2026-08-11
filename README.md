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
npm run dev                 # http://localhost:3000 — PIN 1234
```

The seed loads the real Kaviari catalog extracted from
`data/Import_Review_Kaviari.xlsx` (47 SKUs) plus **nine weeks of real
weekly consumption rates** laid out over the 63 days before "now", current
stock lots (including a short-dated unpasteurized Oscietra lot that
triggers the expiry alerts) and two overlapping open purchase orders so
the order engine demonstrates pipeline-aware behaviour out of the box.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite database file (Prisma) |
| `APP_PIN` | `1234` | Staff login PIN |
| `APP_SECRET` | dev fallback | HMAC key for the session cookie — change in production |
| `ANTHROPIC_API_KEY` | _empty_ | Enables the assistant, import analysis and content studio. **The app fully works without it** — AI surfaces show a friendly notice instead. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5-20250929` | Optional model override |

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

For each product:

```
ADU  = grams consumed in the last 42 days / 42     (or the manual override)
S    = ADU × (L + R + safety) = ADU × 51 days      (order-up-to level)

suggested grams = max(0, S − on-hand grams − on-order grams)
suggested tins  = ceil(suggested grams / tin size)
```

**On-order includes every open PO (status sent or confirmed).** Because
the lead time (21 d) is longer than the review period (15 d), there is
always at least one order still in transit when the next review comes
around; counting that pipeline stock in the inventory position is what
prevents systematic double-ordering. `tests/replenishment.test.ts` covers
exactly this case.

Marking a PO **sent** stamps `lastOrderDate`, which starts the next
15-day countdown shown on the dashboard and planner.

Consumption is drawn **FEFO** (first-expired-first-out): logging usage
allocates tins from the lot with the soonest DLC automatically, and lots
expiring within 14 days raise alerts with a one-click "push to marketing"
promo shortcut.

## Replacing the demo data

1. Put your own price file in `data/` and re-run
   `python3 data/extract_kaviari.py <file.xlsx>` (adjust the script's
   sheet/column mapping to your file), or simply edit
   `data/kaviari_products.json` / `data/consumption_history.json` by hand.
2. Re-seed: `npm run db:seed` (wipes and reloads everything).
3. Or skip seeding and import a supplier price list through
   **Import & Analyze** — the AI maps your columns to the catalog and asks
   for confirmation before writing.

> **Note on prices:** the source workbook contains no unit costs, so the
> seeded `unitCost` values are estimates from typical Kaviari wholesale
> price points (see `EUR_PER_KG` in `data/extract_kaviari.py`). Replace
> them via Import & Analyze or the product editor.

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
| `npm test` | Vitest unit tests (replenishment math, FEFO) |
| `npm run db:push` | Apply schema to the database |
| `npm run db:seed` | Wipe + reseed demo data |
| `npm run setup` | push + seed in one go |

## Project layout

```
app/(app)/          screens (dashboard, inventory, consume, planner,
                    purchase-orders, import, marketing, assistant, settings)
app/api/            route handlers (zod-validated, PIN-gated)
components/ui/      shadcn-style primitives (Radix + Tailwind v4)
lib/                domain logic: replenishment.ts (R,S math), fefo.ts,
                    stock.ts, planner.ts, settings.ts, ai.ts, auth.ts
prisma/             schema + seed
data/               Kaviari catalog + consumption history + extractor
tests/              vitest unit tests
```
