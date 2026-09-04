# 9. Sample Data

`prisma/osms/seed.ts` โหลดข้อมูลตัวอย่างทุกครั้งที่รัน `npm run db:seed`
บัญชีผู้ใช้ไม่ถูกแตะต้อง ข้อมูลโมดูลนี้ถูกล้างและสร้างใหม่ทั้งหมดเพื่อให้
ผลลัพธ์เหมือนเดิมทุกครั้ง

## 1. Master data

### Business channels (§2)

| Code | Name | ชื่อไทย | Default priority |
|---|---|---|---:|
| `FS` | Food Service | ฟู้ดเซอร์วิส | 10 |
| `RTL` | Retail | ค้าปลีก | 20 |
| `STR` | Store | ร้านค้า | 30 |
| `CK` | Central Kitchen | ครัวกลาง | 40 |

### Tolerance rules (§28)

| Scope | เป้าหมาย | Qty | Price | Weight |
|---|---|---:|---:|---:|
| global | ทั้งหมด | 0% | 0% | 0% |
| supplier | Nordic Seafood A/S | 2% | 0% | 5% |
| channel | Store (STR) | 5% | 1% | 5% |

### Suppliers

| Code | Name | Currency | Default unit | MOQ | Lead time |
|---|---|---|---|---:|---:|
| `KAV` | Kaviari Paris | EUR | TIN | – | 21 d |
| `NORSEA` | Nordic Seafood A/S | EUR | KG | 100 | 14 d |
| `OCEANTH` | Ocean Thai Import | THB | KG | 50 | 7 d |

### Customers (แยกตาม channel)

| Code | Name | ชื่อไทย | Channel | Delivery location | Sales owner |
|---|---|---|---|---|---|
| `C001` | Mandarin Oriental Bangkok | แมนดาริน โอเรียนเต็ล | **FS** | Bangkok — Charoen Krung | Ploy |
| `C002` | Blue Elephant Restaurant | บลูเอเลเฟ่นท์ | **FS** | Bangkok — Sathorn | Ploy |
| `C003` | Sirocco Sky Dining | สิรอคโค | **FS** | Bangkok — Silom | Ploy |
| `C010` | Gourmet Market Paragon | กูร์เมต์ มาร์เก็ต พารากอน | **RTL** | Bangkok — Siam | Nattapong |
| `C011` | Villa Market Thonglor | วิลล่า มาร์เก็ต ทองหล่อ | **RTL** | Bangkok — Thonglor | Nattapong |
| `S001` | Kaviari Store Bangkok | ร้านคาเวียรี กรุงเทพ | **STR** | Bangkok — Sukhumvit 39 | Mai |
| `S002` | Kaviari Store Phuket | ร้านคาเวียรี ภูเก็ต | **STR** | Phuket — Bang Tao | Mai |
| `CK001` | Central Kitchen Bangna | ครัวกลาง บางนา | **CK** | Samut Prakan — Bangna | Korn |

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

## 2. หกสถานการณ์ตัวอย่าง

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

### E — Cross-channel shortage (ตัวอย่างตรงตาม §45)

```
SO-2026-0201  FS   Mandarin Oriental      Salmon  1,000 KG
SO-2026-0202  RTL  Gourmet Market         Salmon    500 KG
SO-2026-0203  STR  Kaviari Store Bangkok  Salmon    300 KG
SO-2026-0204  CK   Central Kitchen Bangna Salmon    200 KG
                                          Total SO 2,000 KG
   ↓  SO-PO mapping (many-to-many)
PO-2026-0005  Nordic Seafood  1,200 KG  → FS 1,000 + RTL 200
PO-2026-0006  Nordic Seafood    900 KG  → RTL 300 + STR 300 + CK 200
                                            (+100 KG จาก MOQ pallet)
   ↓
INV-NOR-20502  1,150 KG   (ขาด 50 จาก PO-0005)
INV-NOR-20503    900 KG   (ตรง)
   ↓  Purchasing ยืนยัน 1,150
SHT-2026-0001  pending_approval
   FS   ordered 1,000  approved —   (priority 10)
   RTL  ordered   200  approved —   (priority 20)
   short 50 KG
   ↓
EXC-2026-0004  critical → Management  due +2 วัน
```

**ใช้ทดสอบ:** cross-channel shortage, การบล็อก allocation, การอนุมัติ,
SO 1 ใบ → หลาย PO และ PO 1 ใบ → หลาย SO

หมายเหตุ: STR และ CK ได้ของครบจาก PO-0006 จึงเดินต่อได้ตามปกติ —
มีเฉพาะ FS กับ RTL ที่ติดอยู่ใน case

### F — Warehouse stock / leftover

```
STK-2026-0001  Smoked Salmon  100 KG
   supplier  Nordic Seafood A/S
   PO        PO-2026-0006
   invoice   INV-NOR-20503
   SO ต้นทาง SO-2026-0202 (Gourmet Market)
   channel   RTL
   location  FRZ-02 · lot SAL-2026-11 · expiry +45 วัน
   reason    Pallet rounding on PO-2026-0006 (MOQ)
```

**ใช้ทดสอบ:** หน้า Warehouse stock, การ trace กลับไปยัง order ต้นทาง,
การย้าย stock พร้อมเหตุผล

### G — Demand ที่ยังไม่มี PO เลย

```
PR-2026-0106  Nattapong   Oscietra 125g  12 Tin   (ส่ง +18 วัน)
                          King crab      30 KG
SO-2026-0107  CK  Central Kitchen Bangna  Kristal 125g  6 Tin  (ส่ง +20 วัน)
```
**ใช้ทดสอบ:** กระดาน Order management, การรวม demand เป็น PO, การบังคับเหตุผล
เมื่อสั่งเกิน

## 3. ตารางสรุปสิ่งที่ seed สร้าง

| ตาราง | จำนวน |
|---|---:|
| business_channels | 4 |
| departments / roles | 6 / 2 |
| suppliers | 3 |
| customers | 8 (FS 3 · RTL 2 · STR 2 · CK 1) |
| units | 9 |
| unit_conversions | 5 กลาง + 3 เฉพาะสินค้า |
| tolerances | 3 (global + supplier + channel) |
| sales_orders | 10 |
| purchase_requests | 3 |
| purchase_orders | 6 |
| **so_po_mapping** | **10** (มีทั้ง 1 PO → หลาย SO และ 1 SO → หลาย PO) |
| invoices | 5 (verified ทั้งหมด) |
| po_invoice_reconciliation | 5 |
| so_po_reconciliation | 6 |
| **shortage_cases** | **1 (pending_approval)** |
| **warehouse_stock** | **1 + transaction** |
| exceptions | 5 (open ทั้งหมด) |
| notifications | 4 |
| audit_logs | 3 |

## 4. บัญชีผู้ใช้ตัวอย่าง

Seed ไม่สร้างบัญชีผู้ใช้ (บัญชีไม่เคยถูกลบหรือเขียนทับ) — สร้างเองที่
`/register` แล้วให้ owner กำหนดสิทธิ์ที่ **Settings → Users**:

| ทดสอบอะไร | department | channels |
|---|---|---|
| Sales ที่เห็นช่องทางเดียว | `sales` | ติ๊กเฉพาะ `RTL` |
| Sales Manager | `sales` | กด **Manager · all** |
| Purchasing | `purchasing` | (เห็นทุก channel เสมอ) |
| Warehouse | `warehouse` | (เห็นทุก channel เสมอ) |
| Management | `management` | (เห็นทุก channel เสมอ) |

## 5. ไฟล์ทดสอบการนำเข้า

สร้างไฟล์ตัวอย่างเพื่อทดสอบ validation ได้ด้วย header ภาษาไทย:

| วันที่ส่งสินค้า | รหัสสินค้า | หน่วยคลัง | จำนวน | เลขเอกสาร PR | เลขเอกสาร SO | ชื่อผู้ขอ | เลขเอกสาร PO |
|---|---|---|---|---|---|---|---|
| 2026-10-15 | 3193 | Tin | 36 | PR-2026-0201 | SO-2026-0201 | Ploy | |
| 2026-10-15 | NOPE | Tin | 5 | PR-2026-0201 | SO-2026-0203 | Ploy | | ← 🔴 รหัสไม่พบ |
| 2026-10-15 | 3193 | Tin | 0 | PR-2026-0202 | SO-2026-0204 | Ploy | | ← 🔴 จำนวน 0 |
| not-a-date | 1216 | Tin | 12 | PR-2026-0202 | SO-2026-0205 | Ploy | | ← 🔴 วันที่ผิด |
| 2026-10-15 | 3193 | Tin | 36 | PR-2026-0201 | SO-2026-0201 | Ploy | | ← 🔴 ซ้ำแถวแรก |
| 2026-10-20 | 3193 | **BOX** | 2 | PR-2026-0203 | SO-2026-0206 | Nattapong | | ← 🟡 แปลงเป็น 24 Tin |
