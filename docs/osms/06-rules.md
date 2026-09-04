# 6. Validation Rules & Business Rules

## 1. Validation rules

### 1.1 Import — Purchasing demand file (§1.1)

โค้ด: `lib/osms/import/validate.ts → validateDemandRows()`
**Error** = แถวไม่ถูกนำเข้า · **Warning** = นำเข้าได้ แต่เตือน/ตั้ง exception

| Code | Severity | เงื่อนไข | ข้อความ |
|---|:--:|---|---|
| `PRODUCT_CODE_MISSING` | 🔴 error | ไม่มีรหัสสินค้า | No product code on this row. |
| `PRODUCT_CODE_UNKNOWN` | 🔴 error | รหัสสินค้าไม่พบใน master | Product code X is not in the product master. |
| `QUANTITY_MISSING` | 🔴 error | จำนวนว่างหรือไม่ใช่ตัวเลข | Quantity is missing or not a number. |
| `QUANTITY_INVALID` | 🔴 error | จำนวน ≤ 0 | Quantity X must be greater than zero. |
| `INVALID_DATE` | 🔴 error | วันที่ส่งสินค้าไม่ถูกต้อง | "X" is not a valid delivery date. |
| `UNIT_MISMATCH` | 🔴 error | หน่วยไม่ตรง master และไม่มี conversion | Unit X does not match the master unit Y and no conversion exists. |
| `NO_DOCUMENT` | 🔴 error | ไม่มีทั้ง PR, SO และ PO | The row has no PR, SO or PO number. |
| `DUPLICATE_ROW` | 🔴 error | (PR, SO, PO, product, delivery date) ซ้ำในไฟล์เดียวกัน | This exact combination already appears earlier in the file. |
| `UNIT_CONVERTED` | 🟡 warning | หน่วยต่างจาก master แต่แปลงได้ | 2 BOX converted to 24 TIN. |
| `DUPLICATE_PR` | 🟡 warning | เลข PR มีอยู่แล้วในระบบ | PR X already exists — the line will be added to it. |
| `DUPLICATE_SO` | 🟡 warning | เลข SO มีอยู่แล้ว | SO X already exists — the line will be added to it. |
| `DUPLICATE_PO` | 🟡 warning | เลข PO มีอยู่แล้ว | PO X already exists — the line will be linked to it. |
| `PO_WITHOUT_DEMAND` | 🟡 warning | มี PO แต่ไม่มี PR/SO | PO X has no PR or SO on this row. |
| `DEMAND_WITHOUT_PO` | 🟡 warning | มี PR/SO แต่ไม่มี PO | No PO yet — the line goes to Purchase planning. |

> **ทำไม "PR ซ้ำ" เป็น warning ไม่ใช่ error** — PR ใบเดียวมีหลายบรรทัดเป็นเรื่องปกติ
> การซ้ำที่เป็นปัญหาจริงคือ *ชุดเดียวกันทั้งหมด* (PR+SO+PO+สินค้า+วันที่) ซึ่งจับด้วย
> `DUPLICATE_ROW`

### 1.2 Import — PO file (§1.2)

| Code | Severity | เงื่อนไข |
|---|:--:|---|
| `PO_NUMBER_MISSING` | 🔴 | ไม่มีเลข PO (เป็น primary reference) |
| `SUPPLIER_MISSING` | 🔴 | ไม่มีรหัส Supplier |
| `SUPPLIER_UNKNOWN` | 🟡 | รหัส Supplier ใหม่ → สร้างให้อัตโนมัติ |
| `PRODUCT_CODE_UNKNOWN` | 🔴 | รหัสสินค้าไม่พบ |
| `QUANTITY_INVALID` | 🔴 | จำนวน ≤ 0 |
| `PRICE_INVALID` | 🔴 | ราคาติดลบ |
| `INVALID_DATE` | 🔴 | วันที่ส่งไม่ถูกต้อง |
| `UNIT_MISMATCH` | 🔴 | แปลงหน่วยเป็นหน่วยคลังไม่ได้ |
| `DUPLICATE_ROW` | 🟡 | PO+สินค้า+วันที่ ซ้ำ → เก็บทั้งสองบรรทัด (PO จริงมีบรรทัดซ้ำได้) |

### 1.3 Import — SO file (§1.4)

เหมือน PO file แต่ `CUSTOMER_MISSING` 🔴 / `CUSTOMER_UNKNOWN` 🟡 และ
`DUPLICATE_ROW` เป็น 🔴 (SO ใบเดียวไม่ควรมีสินค้าเดียวกันวันเดียวกันซ้ำ)

### 1.4 Import — Supplier invoice (§1.3)

| กฎ | พฤติกรรม |
|---|---|
| ค่าที่อ่านได้ถูกเก็บดิบทั้งหมด | `extractionRaw` (JSON), `productCodeRaw`, `descriptionRaw`, `poNumberRaw` |
| อ่านไม่ได้ / ไม่มี API key | Invoice ยังถูกสร้าง สถานะ `extracted` ให้กรอกมือ |
| บรรทัดที่จับคู่สินค้าไม่ได้ | `productId = null` → **ห้าม verify** จนกว่าจะเลือกสินค้า |
| ไม่มี PO | สร้าง exception `INVOICE_WITHOUT_PO` → **ห้าม verify** จนกว่าจะผูก PO |
| Invoice ซ้ำ (เลขเดียวกัน + supplier เดียวกัน) | 409 พร้อมลิงก์ไปใบเดิม |
| ทุก field ที่คนแก้ | บันทึกใน `editedFields` + audit log พร้อม old→new |

### 1.5 Purchase order creation (§2)

| กฎ | พฤติกรรม |
|---|---|
| ต้องมี supplier ที่มีอยู่จริง | 404 ถ้าไม่พบ |
| สินค้าทุกบรรทัดต้องมีจริง | 400 ถ้าไม่พบ |
| จำนวน > 0 | zod ปฏิเสธ |
| แปลงหน่วยซื้อ → หน่วยคลังได้ | 422 พร้อมบอกคู่หน่วยที่ขาด |
| **`baseQuantity > requiredQuantity` ⇒ ต้องมี `adjustmentReason`** | **422 `Line N orders X against a demand of Y — a reason for the extra quantity is required.`** |
| เลข PO ซ้ำ | 409 |

### 1.6 PO/Invoice reconciliation (§3.1, §3.2)

| กฎ | พฤติกรรม |
|---|---|
| **`qtyStatus ≠ match` ⇒ ต้องมี `quantityReason`** | 422 `field: quantityReason` |
| **`priceStatus` เป็น higher/lower ⇒ ต้องมี `priceReason`** | 422 `field: priceReason` |
| อนุมัติแล้วห้ามอนุมัติซ้ำ | 409 |
| Reject ⇒ PO line กลายเป็น `BLOCKED` + เหตุผล | ปิดกั้นทุกขั้นถัดไป |
| ทุกการอนุมัติบันทึก User + Date/Time | `reviewedByName`, `reviewedAt` + audit |

### 1.7 Sales review (§4.1, §4.2)

| กฎ | พฤติกรรม |
|---|---|
| **`reason` เป็นค่าบังคับเสมอ** | zod `min(1)` |
| `reduce_so` ⇒ จำนวนใหม่ ≤ จำนวน SO เดิม | 422 |
| `increase_customer` ⇒ จำนวนใหม่ ≥ จำนวน SO เดิม | 422 |
| จำนวนใหม่ต้องไม่เกิน `confirmedQuantity` | 422 `Only X was confirmed — the customer cannot be promised Y.` |
| `originalQuantity` ไม่เคยถูกเขียนทับ | หน้าจอแสดงเลขเดิมขีดฆ่า |

### 1.8 Allocation (§6)

| กฎ | พฤติกรรม |
|---|---|
| PO/Invoice reconciliation ต้อง approved ก่อน | 409 |
| ไม่มี sales review ค้าง | 409 |
| ทุกบรรทัดจำนวน > 0 | 422 |
| target `customer` ⇒ ต้องมี `customerId` | 422 |
| **target `warehouse` ⇒ ต้องมี storage location + reason + responsible dept** | 422 (ทั้งสามข้อ) |
| ห้ามจัดสรรเกินจำนวนจริง | 422 `Over-allocated by X` |
| **complete ได้เมื่อ unallocated = 0 เท่านั้น** | 422 `X still unallocated` |

### 1.9 Receiving (§7.1)

| กฎ | พฤติกรรม |
|---|---|
| **ต้องผ่านครบ 6 ด่าน** | 409 `BLOCKED — <ด่านที่ไม่ผ่าน>` + รายละเอียดทั้ง 6 ด่าน |
| ทุกบรรทัดต้องเป็นของ PO ใบนั้น | 400 |
| **สินค้า `weightControlled` ⇒ ต้องบันทึกน้ำหนักทุกชิ้น** | 422 |
| **ทุกชิ้นต้องถูกจ่ายให้ลูกค้า** | 422 พร้อมรายชื่อชิ้นที่ยังไม่จ่าย |
| น้ำหนักรวมต่อลูกค้าต้องตรงกับที่ allocate (±0.05) | 422 |
| **`itemNo` ห้ามซ้ำในบรรทัดเดียวกัน (§19)** | 422 พร้อมบอกเลขที่ซ้ำ |
| **ลูกค้าต้องอยู่ใน allocation ของบรรทัดนั้น (§19)** | 422 |
| **ยอดสะสมห้ามเกินจำนวนที่ยืนยัน (§23)** | 422 พร้อมบอกยอดที่รับไปแล้ว |
| **`lotRequired` ⇒ ต้องกรอก Lot/Batch** | 422 |
| **`expiryRequired` ⇒ ต้องกรอกวันหมดอายุ** | 422 |
| บันทึกสภาพสินค้ารายชิ้น (good/damaged/rejected) และเวลาที่รับ | เก็บทุกชิ้น |

### 1.10 Shipment (§18)

| กฎ | พฤติกรรม |
|---|---|
| หนึ่ง shipment = หนึ่งลูกค้า | 422 |
| allocation ต้อง `completed` | 409 |
| บรรทัดที่ส่งแล้วส่งซ้ำไม่ได้ | 409 |

---

## 2. Business rules

### BR-01 — จำนวนที่ยืนยันล่าสุดคือความจริง (§14)

```
ลำดับความสำคัญ:  correctedQuantity  >  invoiceQuantity (เมื่อ verified)  >  poQuantity
```

ตัวอย่างจากสเปค:

| ขั้นตอน | จำนวน |
|---|---|
| SO | 500 KG |
| PO (เพราะ MOQ) | 600 KG |
| Invoice | 580 KG |
| Purchasing ยืนยัน | **580 KG** |
| Sales จัดสรร | **580 KG** → ลูกค้า + คลัง |

ห้ามใช้ 600 KG เดิมไปคำนวณ allocation — `confirmedQuantity()` ใน
`lib/osms/reconcile.ts` เป็นที่เดียวที่ตัดสินเรื่องนี้ และถูกเรียกจากทั้ง
allocation, receiving และหน้า trace

### BR-02 — สั่งเกิน demand ต้องมีเหตุผล (§2)

Purchasing สั่งมากกว่า SO/PR ได้เมื่อมีเหตุผล 1 ใน 7 ข้อ: `MOQ`, `PACK_SIZE`,
`CARTON_SIZE`, `MIN_ORDER_VALUE`, `SUPPLIER_REQUIREMENT`, `SAFETY_STOCK`, `OTHER`
เหตุผลถูกเก็บที่ PO line, audit trail และ Supplier order summary
ส่วนต่างจะสร้าง exception ให้ Sales ตัดสินใจตอนของมาถึง

### BR-03 — ความต่างของจำนวน/ราคาต้องมีคนรับผิดชอบ (§3)

```
Quantity Difference   = Invoice Qty − PO Qty
Quantity Difference % = (Invoice Qty − PO Qty) / PO Qty × 100
Price Difference      = Invoice Price − PO Price
Price Difference %    = (Invoice Price − PO Price) / PO Price × 100
```

ต่างเมื่อไร ต้องระบุ Actual Invoice Quantity + Reason + Corrected PO Quantity +
Remark + User + Date/Time ก่อน และ **ห้ามส่งต่อไปขั้น Receiving จนกว่าราคา
จะถูกตรวจและ confirm**

Workflow ของราคา: `Pending Review → Purchasing Review → Approved / Rejected`

### BR-04 — ความต่างกับ SO ต้องให้ Sales ตัดสิน (§4)

| กรณี | ทางเลือกของ Sales |
|---|---|
| **PO/Invoice < SO** | ลด SO ลูกค้าไหน ลดเท่าไร ลูกค้ายอมรับหรือไม่ SO Quantity ใหม่ |
| **PO/Invoice > SO** | (A) เพิ่มให้ลูกค้า หรือ (B) เข้าคลังเป็น stock — ถ้าเลือก B ต้องกรอก Quantity + Reason + Storage Location + Responsible Department |

ระบบไม่ยอมให้ Receiving complete จนกว่าจำนวนจะถูกจัดการครบ

### BR-05 — สมการการจัดสรร (§6)

```
Allocated Customer Qty + Warehouse Qty + Unallocated = Actual Received Qty
Complete ได้เมื่อ Unallocated = 0
```

ตัวอย่างจากสเปค: SO = 500 KG, Actual = 600 KG →
Customer A 200 + Customer B 300 + Warehouse 100 = 600 ✓

### BR-06 — สินค้าชั่งน้ำหนักรายชิ้น (§6.2)

สินค้าที่ `weightControlled = true` (ปลา กุ้ง ปู):

1. คลังบันทึกน้ำหนักทีละชิ้น (`receiving_items`)
2. **Total Actual Weight = ผลรวมน้ำหนักทุกชิ้น** → กลายเป็น actual quantity
3. แต่ละชิ้นถูกจ่ายให้ลูกค้า (`allocationLineId`)
4. น้ำหนักรวมต่อลูกค้าต้องตรงกับที่ allocate ไว้ (±0.05)
5. `shipment_lines.itemRefs` เก็บ id ของชิ้นที่ส่งจริง — ตรวจย้อนหลังได้ว่า
   ปลาตัวไหนไปหาใคร

### BR-07 — การกระจายจำนวนที่ยืนยันไปยัง SO หลายใบ

`distributeConfirmed()` แบ่งตามสัดส่วน demand โดยบรรทัดสุดท้ายรับเศษ
เพื่อให้ผลรวมเท่ากับจำนวนที่ยืนยันพอดีเสมอ ตัวเลขนี้เป็น **ข้อเสนอ** —
Sales แก้รายบรรทัดได้

ตัวอย่าง: ยืนยัน 30 KG, demand SO-A 24 + SO-B 12 → A ได้ 20, B ได้ 10

### BR-08 — Tolerance ตาม Product Type / Supplier / Channel (§28)

Tolerance ไม่ใช่ตัวเลขเดียวทั้งบริษัท — ตั้งได้ 4 ระดับที่
**Master data → Tolerances** และระบบเลือก **กฎที่เจาะจงที่สุด**:

```
supplier  →  channel  →  product type  →  global
```

| Parameter | ใช้กับ |
|---|---|
| `qtyTolerancePct` | PO vs Invoice quantity, Invoice/PO vs SO |
| `priceTolerancePct` | PO vs Invoice price |
| `weightTolerancePct` | น้ำหนักที่จ่ายรายชิ้น vs ที่ allocate ไว้ |

ตัวอย่างจาก sample data:

| Scope | เป้าหมาย | Qty | Price | Weight | เหตุผล |
|---|---|---:|---:|---:|---|
| global | ทั้งหมด | 0% | 0% | 0% | ค่าตั้งต้น — ทุกความต่างต้องมีคนตัดสิน |
| supplier | Nordic Seafood | 2% | 0% | 5% | ของสดชั่งหน้างาน ต่าง 2% เป็นเรื่องปกติ |
| channel | Store (STR) | 5% | 1% | 5% | ร้านของตัวเองรับส่วนต่างเล็กน้อยได้ |

พฤติกรรม:

```
Difference ≤ tolerance  → นับเป็น match → อนุมัติอัตโนมัติ
Difference > tolerance  → Review Required → บังคับเหตุผล
```

### BR-08b — SLA (§27)

ทุกงานที่ส่งต่อให้แผนกอื่นมี **due date + owner + priority** และหน้าจอ
คำนวณ remaining days ให้:

| Step | Due date นับถอยหลังจากวันส่งของ |
|---|---:|
| ตรวจ Invoice | −2 วัน |
| PO/Invoice reconciliation | −2 วัน |
| Sales review | −2 วัน |
| Allocation | −1 วัน |
| อนุมัติ cross-channel shortage | −1 วัน |
| รับของ | วันส่งของ |

สถานะ: `On track` → `Due soon` (ภายใน 3 วัน ปรับได้) → `Overdue` → `Completed`
Exception Center เรียงตาม overdue ก่อน แล้วตาม priority แล้วตามวันครบกำหนด

### BR-08c — Cross-channel shortage ต้องมีคนอนุมัติ (§20, §45)

เมื่อ **ทั้งสองข้อ** เป็นจริง ระบบสร้าง shortage case แล้ว **หยุด**:

1. จำนวนที่ยืนยันแล้ว < demand รวมของบรรทัด PO นั้น
2. demand มาจาก **มากกว่า 1 business channel**

ระหว่างที่ case ยังไม่ถูกตัดสิน:

* บรรทัดนั้นมีสถานะ `EXCEPTION`
* Allocation ถูกปฏิเสธ (409)
* ด่านที่ 4 ของ receiving ไม่ผ่าน

`shortage.approve` มีเฉพาะ **Management** และ **Sales Manager**
Sales ของ channel เดียวอนุมัติไม่ได้ เพราะเป็นการตัดสินแทน channel อื่น

การอนุมัติต้องผ่านสองเงื่อนไข:

```
Σ approvedQuantity = actualQuantity   (ลงตัวพอดี)
approvedQuantity ≤ requestedQuantity  (ทุกบรรทัด)
```

หน้าจอ **ไม่กรอกข้อเสนอให้ล่วงหน้า** — ต้องกด "Fill in the proposal"
หรือพิมพ์เอง เพื่อไม่ให้เกิดการกด Approve โดยไม่อ่าน

### BR-08d — Partial receiving (§23)

PO บรรทัดเดียวรับได้หลายงวด สถานะตัดสินจาก **ผลรวมสะสม** เทียบกับจำนวน
ที่ Purchasing ยืนยัน:

```
PO = 1,000 KG (confirmed)
Delivery 1 = 600   → รวม 600   → PARTIALLY_RECEIVED, PO ยังเปิด
Delivery 2 = 400   → รวม 1,000 → FULLY_RECEIVED, PO ปิด
Delivery 3 = 100   → ปฏิเสธ 422: เกินจำนวนที่ยืนยัน
```

### BR-08e — Warehouse stock ต้อง trace กลับได้ (§24)

ของที่ allocate เข้าคลังจะถูกบันทึกเป็น `warehouse_stock` พร้อม
supplier, PO, invoice, **SO ต้นทาง**, channel, lot, วันหมดอายุ และเหตุผล
จำนวนไม่เคยถูกแก้ตรง ๆ — ทุกการเคลื่อนไหวเขียน transaction พร้อมยอดคงเหลือ
และ **เหตุผลเป็นค่าบังคับ**

### BR-09 — หน่วยกลาง (§11)

ทุกเอกสารเก็บ `baseQuantity` ในหน่วยคลังของสินค้า การเปรียบเทียบข้ามเอกสาร
ใช้ค่านี้เท่านั้น ลำดับการหา conversion:

1. หน่วยเดียวกัน → factor 1
2. กฎเฉพาะสินค้า (`unit_conversions.productId = <id>` หรือ
   `products.purchaseUnit/purchaseConversion`)
3. กฎกลาง (`unit_conversions.productId = null`)
4. ไม่พบ → **ปฏิเสธ** ไม่เดา

### BR-10 — ไม่ลบข้อมูล (§12)

- `sales_order_lines.originalQuantity` ไม่เคยถูกเขียนทับ
- Master data ปิดด้วย `active = false` แทนการลบ
- ทุกการแก้ไขสำคัญเขียน audit row: user, date/time, field, old, new, reason, document
- ค่าที่อ่านจาก Invoice ถูกเก็บดิบไว้แม้จะถูกแก้ทีหลัง

### BR-11 — ห้ามข้ามขั้นตอน (§21)

| ต้องการทำ | เงื่อนไข |
|---|---|
| Verify invoice | ทุกบรรทัดมีสินค้า + ผูก PO แล้ว |
| Allocate | PO/Invoice recon approved + ไม่มี sales review ค้าง + **ไม่มี shortage case ค้าง** |
| READY TO RECEIVE | ผ่านครบ 6 ด่าน |
| รับของเพิ่ม | ยอดสะสมไม่เกินจำนวนที่ยืนยัน |
| ชั่งของ | ทุกชิ้นมีน้ำหนัก ไม่มี itemNo ซ้ำ ทุกชิ้นจ่ายให้ลูกค้าที่อยู่ใน allocation |
| Complete shipment | allocation completed + ยังไม่เคยส่ง + ลูกค้าเดียว |

ถ้าจำนวนมีความต่าง ระบบสร้าง task (exception + notification) ให้แผนกที่รับผิดชอบ
โดยอัตโนมัติ

## BR-20 — แก้ไข PO/Invoice ให้เสร็จก่อนวันส่งสินค้า (flow §4)

| | |
|---|---|
| **กติกา** | ผลต่างระหว่าง PO กับ Invoice ต้องถูกปิดก่อน `deliveryDate` ของ PO line นั้น |
| **ต่างกัน (§4.1)** | ต้องเลือกเหตุผล (`quantityReason` / `priceReason`) และกรอกจำนวนที่ยืนยัน — API ตอบ `422` ถ้าไม่มีเหตุผล |
| **เท่ากัน (§4.2)** | ผ่านอัตโนมัติเมื่ออยู่ใน tolerance — `status = approved`, `reviewedByName = "System (auto-match)"` |
| **Deadline** | `po_invoice_reconciliation.dueDate` = วันส่งสินค้า − `SLA_LEAD_DAYS.poInvoiceReconciliation` (2 วัน) — ระบบคำนวณเอง ไม่มีใครพิมพ์ |
| **ความเร่งด่วน** | `priority` มาจากระยะถึงวันส่งสินค้า: เหลือ >3 วัน = low, ≤3 = medium, ≤1 = high, ถึงวัน/เลยแล้ว = critical (`priorityFor`) |
| **เลยกำหนด** | `sweepOverdueReconciliations()` เปิด exception `RECON_PAST_DELIVERY` ให้ฝ่ายจัดซื้อ severity `high` priority `critical` และปิดเองเมื่อบรรทัดนั้นถูกปิด |
| **ผลถ้าไม่ทำ** | ประตูรับสินค้าด่านที่ 3 ไม่ผ่าน → คลังรับของไม่ได้ทั้ง PO |
| **โค้ด** | `lib/osms/workflow.ts` (สร้าง dueDate), `lib/osms/sla.ts` (`priorityFor`), `lib/osms/exceptions.ts` (`sweepOverdueReconciliations`), `app/api/osms/reconcile/route.ts` |

## BR-21 — สินค้าชั่งทีละชิ้น: คลังชั่ง เซลเลือก คลังจัด (flow §6.2 → §7 → §8)

| | |
|---|---|
| **กติกา** | ปลา 10 ตัวน้ำหนักไม่เท่ากัน แบ่งด้วยเลขคณิตไม่ได้ — **แผนกขาย** เป็นคนเลือกว่าตัวไหนให้ลูกค้าคนไหน |
| **§6.2 คลัง** | กรอกน้ำหนักทุกชิ้น (`receiving_items.weight`) ผลรวมต้องตรงกับจำนวนที่รับ (±0.05) — คลัง **เลือกลูกค้าไม่ได้** |
| **สถานะ** | บรรทัดนั้นไปที่ `receiving_lines.pickStatus = "awaiting_sales_pick"` |
| **§7 เซล** | หน้า `/osms/sales/item-picks` — จับคู่ชิ้น → ลูกค้า ปุ่ม "Suggest a split" เสนอให้เฉย ๆ คนกดยืนยันเอง |
| **การตรวจ** | ทุกชิ้นต้องมีเจ้าของ และน้ำหนักรวมของลูกค้าแต่ละรายต้องตรงกับที่จัดสรรไว้ (±0.05) — ไม่ผ่านตอบ `422` พร้อมชื่อลูกค้า |
| **สิทธิ์** | `sales.pickItems` — แผนกคลังและจัดซื้อได้ `403` ที่ endpoint นี้ |
| **§8 คลัง** | ส่งของได้เมื่อ `pickStatus = "picked"` เท่านั้น — ถ้ายังไม่เลือก `POST /api/osms/shipments` ตอบ `409` |
| **โค้ด** | `app/api/osms/item-picks/route.ts`, `components/osms/sales/item-pick-board.tsx`, `lib/osms/allocation.ts` (`validateItemAssignments`), `app/api/osms/shipments/route.ts` |
