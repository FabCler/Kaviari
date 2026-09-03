# 9. Sample Data

`prisma/seed-scm.ts` โหลดข้อมูลตัวอย่างทุกครั้งที่รัน `npm run db:seed`
บัญชีผู้ใช้ไม่ถูกแตะต้อง ข้อมูลโมดูลนี้ถูกล้างและสร้างใหม่ทั้งหมดเพื่อให้
ผลลัพธ์เหมือนเดิมทุกครั้ง

## 1. Master data

### Suppliers

| Code | Name | Currency | Default unit | MOQ | Lead time |
|---|---|---|---|---:|---:|
| `KAV` | Kaviari Paris | EUR | TIN | – | 21 d |
| `NORSEA` | Nordic Seafood A/S | EUR | KG | 100 | 14 d |
| `OCEANTH` | Ocean Thai Import | THB | KG | 50 | 7 d |

### Customers

| Code | Name | ชื่อไทย | Delivery location | Sales owner |
|---|---|---|---|---|
| `C001` | Mandarin Oriental Bangkok | แมนดาริน โอเรียนเต็ล กรุงเทพ | Bangkok — Charoen Krung | Ploy |
| `C002` | Blue Elephant Restaurant | บลูเอเลเฟ่นท์ | Bangkok — Sathorn | Ploy |
| `C003` | Sirocco Sky Dining | สิรอคโค | Bangkok — Silom | Nattapong |
| `C004` | Phuket Beach Club | ภูเก็ต บีชคลับ | Phuket — Bang Tao | Nattapong |

### Units & conversions

หน่วย: `KG`, `G`, `PC`, `TIN`, `BOX`, `CARTON`, `PACK`, `CASE`, `PK`

Conversion กลาง: `1 KG = 1000 G`, `CARTON = BOX`, `CASE = BOX`, `PK = PACK`,
`TIN = PC`

Conversion เฉพาะสินค้า สร้างจาก `purchaseUnit`/`purchaseConversion` ของ
product master

### Products (นำจาก catalog จริงมาตั้งค่าเพิ่ม)

| Code | Product | ชื่อไทย | Stock unit | Purchase unit | Conv. | MOQ | Supplier | Weighed |
|---|---|---|---|---|---:|---:|---|:--:|
| 3193 | Caviar Kristal 125 g | คาเวียร์ คริสตัล 125 กรัม | Tin | BOX | 12 | 2 | KAV | – |
| 3134 | Caviar Oscietra Prestige 125 g | คาเวียร์ ออเซตร้า เพรสทีจ 125 กรัม | Tin | BOX | 12 | 2 | KAV | – |
| 1216 | Caviar Kristal 30 g | คาเวียร์ คริสตัล 30 กรัม | Tin | BOX | 24 | 1 | KAV | – |
| 3208 | Fz King Crab 130 g/pc | ขาปูคิงแครบแช่แข็ง 130 กรัม/ชิ้น | KG | KG | 1 | 20 | NORSEA | **●** |
| 3168 | Smoked Salmon Imperial | แซลมอนรมควัน อิมพีเรียล | KG | KG | 1 | 10 | NORSEA | – |

## 2. สี่สถานการณ์ตัวอย่าง

แต่ละสถานการณ์จอดอยู่คนละจุดของ workflow เพื่อให้ทุกหน้าจอมีของจริงให้ดู

### A — ตรงกันทุกอย่าง → รอจัดสรร

```
SO-2026-0101  Mandarin Oriental   Kristal 125g   24 Tin
   ↓
PR-2026-0101  Ploy
   ↓
PO-2026-0001  Kaviari Paris       2 BOX = 24 Tin  @ 95.62 EUR
   ↓
INV-KAV-88012  verified            24 Tin  @ 95.62 EUR
   ↓
PO/Invoice reconciliation → match → approved อัตโนมัติ, corrected = 24
   ↓
SO reconciliation → match → completed อัตโนมัติ
   ↓
สถานะ: PENDING_ALLOCATION
```
**ใช้ทดสอบ:** allocation, receiving gate, shipment

### B — Supplier ส่งไม่ครบ + ราคาสูงขึ้น → รอ Purchasing

```
SO-2026-0102  Blue Elephant       Oscietra 125g  36 Tin
   ↓
PO-2026-0002  Kaviari Paris       3 BOX = 36 Tin  @ 103.75 EUR
   ↓
INV-KAV-88044  verified            30 Tin  @ 107.90 EUR   (แก้ด้วยมือ: quantity)
   ↓
reconciliation: qty −6 (−16.67%)  🔴 short
                price +4.15 (+4%) 🟡 higher
                status = pending_review
   ↓
EXC-2026-0001  SUPPLIER_SHORT  high  → Purchasing  due +1 วัน
notification   "PO-2026-0002: 1 line does not match the invoice"
```
**ใช้ทดสอบ:** PO vs Invoice, การบังคับเหตุผล, sales review ที่ตามมา

### C — สั่งเกินเพราะ MOQ → ยังไม่มี Invoice

```
SO-2026-0103  Sirocco Sky Dining  Kristal 30g   18 Tin
   ↓
PO-2026-0003  Kaviari Paris       1 BOX = 24 Tin
              requiredQuantity 18, adjustmentReason = MOQ
              note: "Minimum one box of 24 tins."
   ↓
EXC-2026-0002  MOQ  low  → Sales  due +10 วัน
              "Decide where the extra 6 tins go once the goods arrive."
   ↓
สถานะ: PENDING_INVOICE
```
**ใช้ทดสอบ:** Supplier order summary (ส่วนต่าง +6, +33.3%, reason MOQ), §4.2

### D — สินค้าชั่งน้ำหนัก แบ่ง 2 ลูกค้า

```
SO-2026-0104  Mandarin Oriental   King crab  12 KG
SO-2026-0105  Phuket Beach Club   King crab   8 KG
   ↓
PO-2026-0004  Nordic Seafood      20 KG @ 58 EUR
              demand links: SO-0104 → 12, SO-0105 → 8
   ↓
INV-NOR-20451  verified           20 KG @ 58 EUR → match → approved
   ↓
SO reconciliation → ทั้งสองใบ match → completed
   ↓
สถานะ: PENDING_ALLOCATION   (สินค้า weightControlled)
EXC-2026-0003  WEIGHT_BASED_PRODUCT  medium → Warehouse
```
**ใช้ทดสอบ:** allocation หลายลูกค้า, การชั่งรายชิ้น, การจ่ายชิ้นต่อลูกค้า

### E — Demand ที่ยังไม่มี PO เลย

```
PR-2026-0106  Nattapong   Oscietra 125g  12 Tin   (ส่ง +18 วัน)
                          King crab      30 KG
SO-2026-0107  Phuket Beach Club  Kristal 125g  6 Tin  (ส่ง +20 วัน)
```
**ใช้ทดสอบ:** กระดาน Order management, การรวม demand เป็น PO, การบังคับเหตุผล
เมื่อสั่งเกิน

## 3. ตารางสรุปสิ่งที่ seed สร้าง

| ตาราง | จำนวน |
|---|---:|
| suppliers | 3 |
| customers | 4 |
| units | 9 |
| unit_conversions | 5 กลาง + 3 เฉพาะสินค้า |
| sales_orders | 6 |
| purchase_requests | 3 |
| purchase_orders | 4 |
| invoices | 3 (verified ทั้งหมด) |
| po_invoice_reconciliation | 3 (approved 2, pending 1) |
| so_po_reconciliation | 3 |
| exceptions | 3 (open ทั้งหมด) |
| notifications | 3 |
| audit_logs | 3 |

## 4. ไฟล์ทดสอบการนำเข้า

สร้างไฟล์ตัวอย่างเพื่อทดสอบ validation ได้ด้วย header ภาษาไทย:

| วันที่ส่งสินค้า | รหัสสินค้า | หน่วยคลัง | จำนวน | เลขเอกสาร PR | เลขเอกสาร SO | ชื่อผู้ขอ | เลขเอกสาร PO |
|---|---|---|---|---|---|---|---|
| 2026-10-15 | 3193 | Tin | 36 | PR-2026-0201 | SO-2026-0201 | Ploy | |
| 2026-10-15 | NOPE | Tin | 5 | PR-2026-0201 | SO-2026-0203 | Ploy | | ← 🔴 รหัสไม่พบ |
| 2026-10-15 | 3193 | Tin | 0 | PR-2026-0202 | SO-2026-0204 | Ploy | | ← 🔴 จำนวน 0 |
| not-a-date | 1216 | Tin | 12 | PR-2026-0202 | SO-2026-0205 | Ploy | | ← 🔴 วันที่ผิด |
| 2026-10-15 | 3193 | Tin | 36 | PR-2026-0201 | SO-2026-0201 | Ploy | | ← 🔴 ซ้ำแถวแรก |
| 2026-10-20 | 3193 | **BOX** | 2 | PR-2026-0203 | SO-2026-0206 | Nattapong | | ← 🟡 แปลงเป็น 24 Tin |
