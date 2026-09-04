# 5. UI Wireframe & ตัวอย่างหน้าจอแต่ละแผนก

## 1. หลักการออกแบบหน้าจอ (§19)

- **Left sidebar navigation** — เมนูของ OSMS จัดกลุ่มตามลำดับงาน
  "Supply chain" ที่กรองตามแผนกของผู้ใช้
- **Status cards** — ตัวเลขสำคัญด้านบนทุกหน้า กดแล้วไปที่คิวที่นับมา
- **Data table** — ตารางหลักพร้อม search + filter, เลื่อนแนวนอนได้เมื่อคอลัมน์เยอะ
- **Detail drawer / inline editor** — กด "Review / Decide / Allocate" แล้วแถวขยาย
  ออกมาเป็นฟอร์มในบรรทัดถัดไป ไม่ต้องเปลี่ยนหน้า ไม่หลุด context
- **Approval button** — ปุ่มสีทองคือการยืนยันขั้นสุดท้าย, ปุ่มแดงคือปฏิเสธ
- **Exception warning** — แถบสีตามความรุนแรง พร้อมบอกว่าติดขั้นตอนใด
- **Progress stepper** — บนหน้าเอกสาร

### รหัสสี

| สี | ความหมาย | ใช้กับ |
|---|---|---|
| 🟢 เขียว | Completed / ผ่าน | `COMPLETED`, `approved`, `verified`, ผ่านด่าน |
| 🟡 เหลือง | Pending / รอดำเนินการ | `PENDING_*`, `pending_review`, ส่วนต่างบวก |
| 🔴 แดง | Blocked / Exception | `BLOCKED`, `rejected`, ส่วนต่างลบ, unallocated > 0 |
| 🔵 น้ำเงิน | In progress | `PO_CREATED`, `INVOICE_UPLOADED`, `READY_TO_RECEIVE` |
| ⚪ เทา | Not started | `IMPORTED`, `draft`, `CANCELLED` |

---

## 2. Layout กลาง

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│ KAVIARI    │  Supply chain workflow                    [8 exceptions][Import]│
│ CELLAR     │  Customer order → SO/PR → PO → invoice → … → shipment         │
│ ────────── │ ──────────────────────────────────────────────────────────── │
│ Dashboard  │  MANAGEMENT                                                   │
│ Inventory  │  ┌────────┐┌────────┐┌────────┐┌────────┐                    │
│ Consumption│  │Total PO││Total SO││Invoices││Received│   ← status cards    │
│ …          │  │   6    ││  11    ││   3    ││   44   │                    │
│            │  └────────┘└────────┘└────────┘└────────┘                    │
│ SUPPLY     │                                                               │
│  CHAIN     │  PURCHASING                                                   │
│ ▸ Workflow │  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐          │
│  Import    │  │PO pend.││Mismatch││Qty diff││Price   ││No inv. │          │
│  Order mgmt│  └────────┘└────────┘└────────┘└────────┘└────────┘          │
│  Supplier  │                                                               │
│  Invoices  │  ┌─ Lines needing attention ────┐ ┌─ Notifications ─────────┐│
│  PO vs Inv │  │ PO      Product   Delivery   │ │ PO-0002: 1 line…   Open ││
│  Sales rev.│  │ PO-0002 Oscietra  6 Oct  🟡  │ ├─ Open exceptions ───────┤│
│  Allocation│  │ PO-0004 King crab 2 Oct  🟡  │ │ EXC-0001 Supplier short ││
│  PO vs SO  │  └──────────────────────────────┘ └─────────────────────────┘│
│  Receiving │                                                               │
│  Shipments │                                                               │
│  Exceptions│                                                               │
│  Master    │                                                               │
│  Audit     │                                                               │
│ ────────── │                                                               │
│ Fabien     │                                                               │
│ OWNER·ADMIN│                                                               │
└────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 3. Import Files (§1)

```
Import files
[Purchasing demand] [Purchase orders] [Sales orders] [Supplier invoice]
────────────────────────────────────────────────────────────────────────
Import file from purchasing (§1.1)
PR/SO lines with the PO number that covers them. Validated for duplicates,
unknown product codes, unit mismatches, zero/negative quantities…

  Expected columns (English or Thai headers)
  [วันที่ส่งสินค้า][รหัสสินค้า][ชื่อสินค้าอังกฤษ][ชื่อสินค้าไทย][หน่วยคลัง]
  [จำนวน][หน่วยซื้อ][ประเภทสินค้า][เลขเอกสาร PR][เลขเอกสาร SO][ชื่อผู้ขอ]
  [เลขเอกสาร PO][Business Channel]

  ┌──────────────────────────────────────────┐
  │   ⬆  Drop a .xlsx / .csv file here       │
  └──────────────────────────────────────────┘
  [Check the file]  [Import 3 rows]

  🟢 3 ready   🟡 3 with warnings   🔴 4 blocked

  Row │ Data                                  │ Findings
  ────┼───────────────────────────────────────┼─────────────────────────────
   2  │ productCode: 3193  quantity: 36 …     │ ! No PO yet — goes to Order
      │                                       │   management
   4  │ productCode: NOPE  quantity: 5 …      │ ✕ Product code NOPE is not in
      │                                       │   the product master
      │                                       │   This row will not be imported
   5  │ productCode: 3193  quantity: 0 …      │ ✕ Quantity 0 must be > 0
   6  │ deliveryDate: not-a-date …            │ ✕ "not-a-date" is not a valid
      │                                       │   delivery date
   7  │ (duplicate of row 2)                  │ ✕ This exact PR/SO/PO + product
      │                                       │   + delivery date already appears
   8  │ quantity: 2 BOX …                     │ ! 2 BOX converted to 24 TIN
```

**แท็บ Supplier invoice** ต่างออกไป: อัปโหลด PDF → ระบบอ่าน → พาไปหน้าตรวจสอบทันที

---

## 4. Purchasing

### 4.1 Purchase planning (§8)

```
Purchase planning
Required, already ordered and still remaining — per demand line, across
every business channel.

[All channels][FS][RTL][STR][CK]
[🔍 Search PR, SO, product, customer…] [All suppliers ▾] [Plan a purchase order (2)]

☑ │ Document       │Chan.│ Product          │ Customer   │ Required │ On PO │ Remaining │ MOQ │ Delivery
──┼────────────────┼─────┼──────────────────┼────────────┼─────────┼───────┼───────────┼─────┼─────────
☑ │ PR-2026-0106   │  —  │ Oscietra 125g    │ –          │  12 Tin │   0   │   12 🟡   │  2  │ 21 Sep
  │ Nattapong      │     │ 3134 · ออเซตร้า   │            │         │       │           │     │
☑ │ SO-2026-0107   │[CK] │ Kristal 125g     │ Central    │   6 Tin │   0   │    6 🟡   │  2  │ 23 Sep
  │ Nattapong      │     │ 3193 · คริสตัล    │ Kitchen    │         │       │           │     │
  │ SO-2026-0202   │[RTL]│ Salmon           │ Gourmet    │ 500 KG  │  200  │  300 🟡   │ 100 │  6 Sep
  │ Nattapong      │     │ 3168             │ Market     │         │       │  ← SO เดียวแบ่งไปหลาย PO

┌─ New purchase order ─────────────────────────────────────────────────────────┐
│ Ordering more than the demand requires a reason — it is stored on the line,   │
│ the audit trail and the supplier summary.                                     │
│                                                                               │
│ Supplier [CHP · Caviar House Paris ▾]   Remark [                              ]    │
│                                                                               │
│ Product        │ Required │ Order qty │ Unit │ Price │ Delivery │ Diff │ Reason│
│ ───────────────┼──────────┼───────────┼──────┼───────┼──────────┼──────┼───────│
│ Oscietra 125g  │    12    │ [   24  ] │[BOX] │[103.7]│[21/09/26]│ +12🟡│[MOQ ▾]│
│ 3134 · MOQ 2   │          │           │      │       │          │      │       │
│ Kristal 125g   │     6    │ [    6  ] │[BOX] │[ 95.6]│[23/09/26]│   0  │[ – ▾ ]│
│                │          │           │      │       │          │      │  ⚠ Required
│                                                                               │
│ [Issue the purchase order]  [Cancel]                                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Supplier order summary (§2.1)

```
Supplier order summary                                        [Export Excel]
What was ordered against what was asked for, per supplier and product.

[Supplier ▾][Product ▾][Status ▾][Delivery from][to]              [Clear]

Supplier    │ PO        │ Product   │ Required │ Order │ MOQ │ Diff │ Diff % │ Reason │ Delivery │ Status
────────────┼───────────┼───────────┼──────────┼───────┼─────┼──────┼────────┼────────┼──────────┼────────
Caviar House     │ PO-0003   │ Kristal   │  18 Tin  │ 24 Tin│  1  │ +6 🟡│ +33.3% │ MOQ    │ 12 Oct   │ Pending
Paris       │           │ 30g       │          │       │     │      │        │        │          │ invoice
Caviar House     │ PO-0001   │ Kristal   │  24 Tin  │ 24 Tin│  2  │   0  │   0.0% │ –      │  4 Oct   │ Ready
Paris       │           │ 125g      │          │       │     │      │        │        │          │ to receive
────────────┴───────────┴───────────┼──────────┼───────┼─────┼──────┼────────┴────────┴──────────┴────────
                            Total   │  42      │  48   │     │ +6   │
```

### 4.3 PO vs Invoice (§3)

```
PO vs Invoice
Quantity and price compared line by line. Tolerance: 0% on quantity, 0% on price.

┌ Lines compared 3 ┐┌ Waiting for purchasing 1 🔴 ┐┌ Qty differences 1 🟡 ┐┌ Price differences 1 🟡 ┐

PO / Invoice        │ Product   │PO qty│Inv qty│Qty diff│Qty %  │PO price│Inv price│Price diff│Status  │
────────────────────┼───────────┼──────┼───────┼────────┼───────┼────────┼─────────┼──────────┼────────┤
PO-2026-0002        │ Oscietra  │  36  │  30   │  -6 🔴 │-16.7% │ 103.75 │ 107.90  │ +4.15 🟡 │Pending │[Review]
INV-CHP-88044 · Kav │ 3134      │      │       │        │       │        │         │          │review  │

  ┌─ Review ────────────────────────────────────────────────────────────────────┐
  │ Confirm the quantity that actually arrived. From here on, the corrected      │
  │ quantity — not the ordered quantity — drives the sales review, allocation    │
  │ and receiving.                                                              │
  │                                                                             │
  │ Corrected qty (Tin) │ Quantity reason (required) │ Price reason (required)  │
  │ [        30       ] │ [Supplier delivered short▾]│ [Price list updated  ▾]  │
  │ Remark [Agreed with the supplier on 3 April                               ]      │
  │                                                                             │
  │ [Confirm the corrected quantity] [Keep under review] [Reject]               │
  └─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Supplier invoice verification (§1.3)

```
INV-CHP-88044                                    [All invoices] [Open the PO]
Caviar House Paris · INV-CHP-88044.pdf · read automatically

┌ Invoice header ──────────────────────────────── [Pending verification 🟡] ┐
│ PO printed on the document: PO-2026-0002                                   │
│ Invoice number │ Purchase order          │ Invoice date │ Delivery date    │
│ [INV-CHP-88044]│ [PO-2026-0002 · CHP    ]│ [02/10/2026] │ [06/10/2026]     │
└────────────────────────────────────────────────────────────────────────────┘

┌ Extracted lines (1) ───────────────────────────────────────────────────────┐
│ Every line is matched to a product. Fields marked with a pencil were        │
│ corrected by hand.                                                         │
│ # │Read from the document      │Product          │Quantity│Unit│Unit price │
│ 1 │CAVIAR OSCIETRA PRESTIGE… │[3134 · Oscietra▾]│[  30  ]│[Tin]│[ 107.90 ]│
│   │3134                       │                  │✎corrected│   │          │
│                                              Document total: 3,237.00 EUR  │
└────────────────────────────────────────────────────────────────────────────┘

[Save corrections] [Verify and reconcile against the PO]
Reject the invoice [                                    ] [Reject]
```

---

## 5. Sales

### 5.1 Sales review (§4.1 / §4.2)

```
Invoice / PO vs Sales order
What the supplier actually delivered, compared with what the customer ordered.

┌ Lines reviewed 4 ┐┌ Waiting for a decision 1 🔴 ┐┌ Short 1 🟡 ┐┌ Over 0 ┐

Customer / SO      │Product  │SO qty│PO/Inv qty│Difference│Diff % │Decision│Status
───────────────────┼─────────┼──────┼──────────┼──────────┼───────┼────────┼──────────
SO-2026-0102       │Oscietra │36 Tin│  30 Tin  │  -6 🔴   │-16.7% │  –     │Pending  [Decide]
Blue Elephant      │3134     │      │          │          │       │        │sales rev.

  ┌─ Decide ────────────────────────────────────────────────────────────────┐
  │ The supplier delivered 6 Tin less than Blue Elephant ordered. Record     │
  │ what was agreed with the customer.                                      │
  │                                                                         │
  │ Decision              │New SO quantity│Customer accepted│Reason (required)│
  │ [Reduce the order  ▾] │ [    30     ] │   [●] Yes       │[Blue Elephant   │
  │                       │ Available: 30 │                 │ accepted 30/36] │
  │ [Save the decision]                                                     │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Order allocation (§6)

```
Order allocation
Assign the confirmed quantity to customers and to warehouse stock.
Total allocation must equal the actual quantity.

┌ Lines to allocate 3 ┐┌ Completed 1 🟢 ┐┌ Unallocated quantity 20 🔴 ┐

PO       │Product   │Ordered│Actual received│Allocated│Unallocated│Status     │
─────────┼──────────┼───────┼───────────────┼─────────┼───────────┼───────────┤
PO-0004  │King crab │20 KG  │    20 KG      │    0    │   20 🔴   │Not started│[Allocate]
Nordic   │3208      │       │               │         │           │           │

  ┌─ Allocate ──────────────────────────────────────────────────────────────┐
  │ Actual received: 20 KG   Allocated: 20   [ Fully allocated 🟢 ]          │
  │                                                                         │
  │ Target     │Customer / SO           │Quantity│Storage   │Reason │Resp.  │
  │ ───────────┼────────────────────────┼────────┼──────────┼───────┼───────│
  │ [Customer▾]│[Mandarin · SO-0104   ▾]│[  12  ]│    –     │       │   –   │🗑
  │ [Customer▾]│[Phuket Beach · SO-0105▾]│[   8  ]│    –     │       │   –   │🗑
  │                                                                         │
  │ [+ Customer line] [+ Warehouse stock] [Save draft] [Complete allocation] │
  └─────────────────────────────────────────────────────────────────────────┘

  ▸ กรณีสินค้าเกิน (§4.2) เพิ่มบรรทัด Warehouse stock:
  │ [Warehouse▾]│ Leftover into stock  │[  6   ]│[MAIN-COLD]│[MOQ]  │[Sales▾]│
  │              storage / reason / responsible เป็นค่าบังคับ                 │
```

---

## 6. ตัวอย่างหน้าจอแต่ละแผนก

### 6.1 Warehouse — Receiving queue (§21)

```
Warehouse receiving
Only orders that cleared all six checks can be received.

┌ Ready to receive 1 🟢 ┐┌ Blocked 2 🔴 ┐┌ Received 1 ┐

PO        │Supplier      │Expected│Lines│Receipt│Gate                        │
──────────┼──────────────┼────────┼─────┼───────┼────────────────────────────┤
PO-0001   │Caviar House Paris │ 4 Oct  │  1  │RCV-0001│ Completed 🟢              │[Open]
PO-0004   │Nordic Seafood│ 2 Oct  │  1  │   –   │ Ready to receive 🟢         │[Receive]
PO-0002   │Caviar House Paris │ 6 Oct  │  1  │   –   │ Blocked 🔴                 │[Why blocked?]
          │              │        │     │       │ Quantity passed purchasing │
          │              │        │     │       │ reconciliation — 1 line(s) │
          │              │        │     │       │ still pending review.      │
```

### 6.2 Warehouse — Receive goods (§22 + §18)

```
Receive PO-2026-0004                                     [Back to the queue]
Nordic Seafood A/S · expected 2 Oct 2026

┌ Receiving validation ─────────┐  ┌ Goods receipt ───────────────────────────┐
│ ┌───────────────────────────┐ │  │ Received on [02/10/2026]  Notes [      ] │
│ │   READY TO RECEIVE  🟢    │ │  │                                          │
│ └───────────────────────────┘ │  │ ┌ King crab 3208 · expected 20 KG ─────┐ │
│ ✓ Check 1 · Purchase order    │  │ │                        0 KG vs expected│ │
│   is valid                    │  │ │ Actual qty │Lot     │Expiry │Location │ │
│   PO invoiced with 1 line(s). │  │ │ [  20.0  ] │[CRAB-1]│[…]    │[FRZ-01] │ │
│ ✓ Check 2 · Supplier invoice  │  │ │ (calculated from the weighed items)   │ │
│   is verified                 │  │ │                                       │ │
│ ✓ Check 3 · Quantity passed   │  │ │ ⚖ Individual items (10)               │ │
│   purchasing reconciliation   │  │ │ [+ Add one] [+ Add ten]               │ │
│ ✓ Check 4 · SO passed sales   │  │ │ Item no.  │Weight (KG)│Customer       │ │
│   reconciliation              │  │ │ [CRAB-01] │[   2.1  ] │[Mandarin ▾]  🗑│ │
│ ✓ Check 5 · Allocation is     │  │ │ [CRAB-02] │[   1.9  ] │[Mandarin ▾]  🗑│ │
│   complete                    │  │ │ …                                     │ │
│ ✓ Check 6 · Unallocated       │  │ │ Mandarin · 12 KG: 12.0 assigned ✓     │ │
│   quantity is zero            │  │ │ Phuket · 8 KG: 8.0 assigned ✓         │ │
└───────────────────────────────┘  │ └───────────────────────────────────────┘ │
                                    │ [Record the receipt] [Receive and complete]│
                                    └──────────────────────────────────────────┘
```

เมื่อไม่ผ่านด่าน: แผงซ้ายกลายเป็น **BLOCKED 🔴** พร้อมบอกว่าติดด่านไหน และ
ฟอร์มด้านขวาไม่แสดง

### 6.3 Warehouse — Shipments (§25)

```
Shipments
Allocated quantities that have been received and are ready to leave.

┌ Ready to ship ──────────────────────── Ship date [02/10/2026] [Ship 2 lines]┐
│ Mandarin Oriental Bangkok — Bangkok, Charoen Krung                          │
│ ☑ │Product        │SO / PO      │Quantity│Items│Allocation                  │
│ ☑ │Kristal 125g   │SO-0101      │ 24 Tin │  –  │ALC-2026-0001               │
│ ☑ │King crab 3208 │SO-0104      │ 12 KG  │  6  │ALC-2026-0002               │
│                                                                             │
│ Phuket Beach Club — Phuket, Bang Tao                                        │
│ ☐ │King crab 3208 │SO-0105      │  8 KG  │  4  │ALC-2026-0002               │
└─────────────────────────────────────────────────────────────────────────────┘
  ⚠ เลือกข้ามลูกค้าจะขึ้น "One shipment goes to one customer"
```

### 6.3b Management — Cross-channel shortage decision (§20, §45)

```
SHT-2026-0001                                    [All cases] [Document trace]
Norwegian Smoked Salmon         · PO-2026-0005 · Nordic Seafood · delivery 6 Sep

┌ The shortfall ──────────────────────────────── [Pending approval 🟡] ──────┐
│ TOTAL ORDERED BY CUSTOMERS    ACTUALLY AVAILABLE       SHORT                │
│ 1,200 KG                      1,150 KG                 50 KG 🔴             │
│                                                                             │
│ The quantities below are a PROPOSAL derived from the channel priorities.    │
│ No customer order has been changed. Approving writes exactly the numbers    │
│ in the "Approved" column.                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌ Allocation across channels ─────────────────── [🪄 Fill in the proposal] ──┐
│ Priority│Channel│Customer / SO         │Ordered│Proposed│Approved│Reduction│
│ ────────┼───────┼──────────────────────┼───────┼────────┼────────┼─────────│
│   10    │ [FS]  │Mandarin Oriental     │1,000  │ 1,000  │[  —  ] │    —    │
│         │       │SO-2026-0201          │       │        │        │         │
│   20    │ [RTL] │Gourmet Market Paragon│  200  │   150  │[  —  ] │    —    │
│         │       │SO-2026-0202          │       │        │        │         │
│ ────────┴───────┴──────────────────────┼───────┼────────┼────────┴─────────│
│ Total                                  │ 1,200 │ 0/1,150│ 1,150 KG still   │
│                                        │       │        │ unassigned 🔴    │
│                                                                             │
│ Decision note [What was agreed, and with whom                          ]    │
│ [Approve this split]  [Reject]        ← Approve stays disabled until it     │
│                                          adds up to exactly 1,150           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**การออกแบบที่ตั้งใจ:** ช่อง Approved เปิดมาว่าง ไม่ใช่เติมข้อเสนอไว้ให้ —
ฟอร์มที่เปิดมาพร้อมตัวเลขชวนให้กด Approve โดยไม่อ่าน ผู้อนุมัติต้องกด
"Fill in the proposal" อย่างตั้งใจ หรือพิมพ์ตัวเลขของตัวเอง

### 6.3c Warehouse — Stock & leftover (§24)

```
Warehouse stock & leftover
Everything received that did not go straight to a customer, with the order
it came from.

[All channels][FS][RTL][STR][CK]
┌ Stock lines 1 ┐┌ Total quantity 100 ┐┌ Expiring within 14 days 0 🟢 ┐

Stock       │Product    │Quantity│Channel│Origin           │Location│Expiry │Status
────────────┼───────────┼────────┼───────┼─────────────────┼────────┼───────┼───────
STK-2026-   │Smoked     │ 100 KG │ [RTL] │PO-2026-0006     │FRZ-02  │21 Oct │On hand
0001        │Salmon     │        │       │Nordic Seafood   │SAL-    │45 d   │[Move]
            │3168       │        │       │SO-2026-0202 ·   │2026-11 │       │
            │           │        │       │Gourmet Market   │        │       │

  Move STK-2026-0001                                          (dialog)
  100 KG on hand. Every movement is recorded with its reason and the
  balance it leaves behind.
  Movement  [Out — sold or transferred ▾]
  Quantity  [    40    ] KG
  Reason    [Sold to Villa Market                    ]  ← required
  [Record the movement]
```

### 6.3d Management — Performance (§33, §34)

```
Performance reports
[All channels][FS][RTL][STR][CK]
[Supplier ▾][Product ▾][Delivery from][to]                    [Clear filters]

Supplier performance
Supplier    │PO lines│PO qty│Inv qty│Actual│Short%│Excess%│Price var│Qty acc│On time
────────────┼────────┼──────┼───────┼──────┼──────┼───────┼─────────┼───────┼───────
Caviar House     │   4    │  108 │   102 │   24 │25.0% │  0.0% │    4.15 │ 75.0% │100.0%
Nordic      │   3    │2,120 │ 2,070 │   20 │33.3% │  0.0% │    0.00 │ 66.7% │100.0%

Channel performance
Channel │Customers│SOs│SO qty│PO qty│Actual│Shipment│Short│Excess│Stock
────────┼─────────┼───┼──────┼──────┼──────┼────────┼─────┼──────┼─────
[FS]    │    2    │ 4 │1,024 │1,024 │1,000 │     24 │   0 │    0 │    0
[RTL]   │    1    │ 2 │  518 │  518 │  450 │      0 │ 350 │    0 │  100
[STR]   │    1    │ 2 │  308 │  308 │  300 │      8 │   0 │    0 │    0
[CK]    │    1    │ 2 │  206 │  206 │  200 │      0 │   0 │    0 │    0
```

### 6.4 Management — Document trace (§37)

```
Purchase order PO-2026-0001            Caviar House Paris · 24 Sep 2026 · Mandarin Oriental

┌ Workflow ───────────────────────────────────────────────────────────────────┐
│ ✓SO/PR — ✓PO — ✓Invoice — ✓PO vs Invoice — ✓Sales review — ✓Allocation —    │
│ ●Receiving — ○Shipment                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌ Sales order ─┐┌ Purchase req.┐┌ Purchase ord.┐┌ Invoice ─────┐
│ SO-2026-0101 ││ PR-2026-0101 ││ PO-2026-0001 ││ INV-KAV-88012│
│ Open 🔵      ││ Ordered 🟢   ││ Closed 🟢    ││ Verified 🟢  │
└──────────────┘└──────────────┘└──────────────┘└──────────────┘
┌ Receiving ───┐┌ Allocation ──┐┌ Shipment ────┐
│ RCV-2026-0001││ ALC-2026-0001││ SHP-2026-0001│
│ Completed 🟢 ││ Completed 🟢 ││ Shipped 🟢   │
└──────────────┘└──────────────┘└──────────────┘

┌ Quantities through the chain ───────────────────────────────────────────────┐
│ Product      │ SO │ PO │ Invoice │ Confirmed │ Received │ Allocated │Status │
│ Kristal 125g │ 24 │ 24 │   24    │    24     │    24    │    24     │🟢 Comp│
└─────────────────────────────────────────────────────────────────────────────┘

┌ Audit trail for PO-2026-0001 ───────────────────────────────────────────────┐
│ 2 Oct · Anna (purchasing) · approve  status verified                        │
│ 24 Sep · Anna (purchasing) · create  status → issued (1 line)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Admin — Master data

```
Master data
[Suppliers][Customers][Products][Units & conversions][Tolerances]

Product master
The supply-chain fields on the shared product catalog.
[🔍 Search a product…]

Code│Name           │Thai name         │Stock│Purchase│Conv.│MOQ│Default supplier│Weighed
────┼───────────────┼──────────────────┼─────┼────────┼─────┼───┼────────────────┼───────
3193│Kristal 125g   │[คาเวียร์ คริสตัล] │ Tin │ [BOX]  │[12] │[2]│[Caviar House Paris▾]│  ○
3208│Fz King Crab   │[ขาปูคิงแครบ…]     │ KG  │ [KG]   │[1]  │[20]│[Nordic Seafood▾]│ ●

Tolerances
A difference inside the tolerance counts as a match and is approved
automatically. Set both to 0 to require a human decision on every difference.
Quantity tolerance (%) [0]  Price tolerance (%) [0]
Delivery warning (days) [3] Default storage location [MAIN-COLD]
```
