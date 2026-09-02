# DC2 Shipment Receiving Readiness

Checks a shipment before it reaches the DC2 warehouse: the SAP purchase order,
the supplier invoice and the customer sales orders have to agree, and every
exception has to be cleared by the desk that owns it, before DC2 is told to
receive the goods.

It replaces the single-page version of the app with a server, real accounts and
department access.

## What it does

| Screen | Who works in it | What it is for |
| --- | --- | --- |
| Dashboard | everyone | Where each shipment stands |
| Shipment Setup | Purchasing | The shipment, its ETA and the CS tolerance |
| SAP Imports | Purchasing | PO, supplier invoice and customer SO exports (.xlsx / .csv / PDF) |
| Validation | Purchasing, Sales, CS | The four lanes: Hold → Purchase Review → Sale Review → Ready |
| SO Adjustment | Customer Service, Sales | Allocating the invoiced quantity across the customer orders |
| Exceptions | every desk | The open queue, its own first |
| Receiving Release | Warehouse DC2 | READY / HOLD and the expected receiving quantity |
| Item Management | Purchasing | The item master and each supplier's own product codes |
| User Management | owner, administrators | Approving accounts and setting departments |

### The rules it applies

- **Two decimals.** A supplier invoice is read to two decimals, so a PO of
  37.06 against an invoice of 37.056 is the same delivery. The imported line
  keeps every decimal it arrived with.
- **PO ↔ invoice** differences (quantity, price, currency, unit) are
  Purchasing's, and hold the line in Purchase Review.
- **Invoice ↔ customer demand**: within the shipment's tolerance Customer
  Service allocates; beyond it the line waits for Sales.
- An invoice above **both** the PO and customer demand needs a recorded root
  cause before release.
- A line is READY only when all three documents are in, every desk has
  confirmed its exception, and the revised customer SO total plus approved free
  stock equals the invoiced quantity.

### Reading a PDF

A supplier PDF is a drawing, not a table: there are no columns, only strings at
coordinates. `lib/import/pdf.ts` extracts the text with its positions, clusters
it into lines, and accepts a line as a document row only when its numbers obey
**quantity × price = amount** — the invariant that keeps a page-break overlay or
a footer out of the result. European and English decimals are detected per
document.

What comes out is a proposal: the rows open in an editable preview and nothing
is written until the desk confirms them.

A PDF that is a **scan** has no text layer at all. The app says so plainly, and
- when `ANTHROPIC_API_KEY` is set - offers to read the pages instead: the
document is sent to Anthropic's API, Claude reads the printed table, and the
lines come back into the same editable preview marked as read from a scan, with
its legibility and any note about a figure it could not make out. Two things
follow from that, and both are on the screen: the document leaves the server to
be read, and a misread digit becomes the quantity DC2 receives unless somebody
checks it against the paper. Leave the key unset and the button never appears.

### Accounts

Registration is open, but a new account is `pending` and opens nothing until an
owner or administrator approves it and sets its department — this app releases
goods. The account whose email matches `OWNER_EMAIL` becomes the owner on
registration.

Department access is enforced on the server, inside every page and every
action, not just in the menu.

## Running it locally

```bash
npm install
cp .env.example .env        # then set APP_SECRET and OWNER_EMAIL
npm run setup               # creates the SQLite database
npm run dev                 # http://localhost:3000
```

Register with the email in `OWNER_EMAIL` to get the owner account, then invite
the rest of the team: they register, you approve them under User Management.

```bash
npm test        # the rules, the importer and the access matrix
npm run build   # production build
```

## Deploying to Railway

The service runs the same way as the Kaviari app:

1. New service from this repository, **root directory `dc2-receiving`**.
2. Add a volume mounted at `/data`.
3. Variables:
   - `DATABASE_URL` = `file:/data/dc2.db`
   - `APP_SECRET` = a long random string (anyone who knows it can mint a
     session — change it from the example)
   - `OWNER_EMAIL` = the owner's work email
   - `APP_URL` = the public URL Railway gives the service
4. Deploy. `npm run start:railway` applies the schema on boot and starts Next.

`prisma db push` runs on every boot and applies additive changes in place. It
never resets the database — a schema change it cannot apply in place fails the
deploy instead of dropping receiving data.

## Where things are

```
app/(app)/…        one folder per screen: page.tsx + its server actions
lib/domain.ts      the validation engine — pure, unit-tested, no database
lib/workspace.ts   loading a shipment out of Prisma into the engine
lib/import/        reading .xlsx/.csv and matching lines to the item master
lib/permissions.ts departments, sections, and who may clear whose exception
lib/auth.ts        password hashing, session cookies, the request guards
prisma/schema.prisma
tests/             the rules, the importer, the access matrix
```
