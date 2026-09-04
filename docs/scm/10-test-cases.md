# 10. End-to-End Test Cases

## 1. เทสต์อัตโนมัติที่มีอยู่

`npm test` — 143 เทสต์ ครอบคลุมกฎธุรกิจทั้งหมดในชั้น domain

| ไฟล์ | ครอบคลุม |
|---|---|
| `tests/scm-reconcile.test.ts` | variance, qty/price status, tolerance, `confirmedQuantity()` (§14), Invoice/SO, PO vs SO ทั้ง 5 สถานะ |
| `tests/scm-allocation.test.ts` | สมการการจัดสรร, การบังคับ location/reason/dept, over-allocation, การชั่งรายชิ้น |
| `tests/scm-gate.test.ts` | ด่านทั้ง 6 แต่ละด่านทั้งกรณีผ่านและไม่ผ่าน + ลำดับการรายงาน |
| `tests/scm-units.test.ts` | การแปลงหน่วยสองทาง, กฎเฉพาะสินค้าชนะกฎกลาง, การปฏิเสธเมื่อไม่มี conversion |
| `tests/scm-status.test.ts` | 22 สถานะ, `resolveStatus()`, partial vs fully received, EXCEPTION/REJECTED, กติกาการเปลี่ยนสถานะ |
| `tests/scm-channels.test.ts` | channel scoping, `narrowScope()` (กัน URL ขยายสิทธิ์), permission matrix รวม Sales Manager |
| `tests/scm-shortage.test.ts` | ข้อเสนอการแบ่งข้าม channel ตาม §45, การตรวจการอนุมัติ |
| `tests/scm-tolerance-sla.test.ts` | ลำดับ tolerance (supplier → channel → product type → global), SLA on track/due soon/overdue |

## 2. End-to-End test cases

รันด้วยมือบน seed data (`npm run setup`) หรือใช้เป็นสคริปต์ UAT

---

### E2E-01 — เส้นทางปกติทั้งสาย (Happy path)

**เป้าหมาย:** SO → PR → PO → Invoice → recon → allocation → receiving → shipment

| # | ผู้ทำ | ขั้นตอน | ผลที่คาด |
|---|---|---|---|
| 1 | Purchasing | Import files → Purchasing demand → อัปโหลดไฟล์ demand | ตาราง preview ขึ้น, บรรทัดที่ถูกต้องขึ้น "OK" |
| 2 | Purchasing | กด Import | เอกสาร PR/SO ถูกสร้าง, แจ้งเตือนไป Purchasing |
| 3 | Purchasing | Order management → เลือกบรรทัด → Plan a purchase order | ฟอร์มร่าง PO ขึ้น, จำนวนตั้งต้น = outstanding |
| 4 | Purchasing | เลือก supplier, กด Issue | PO ถูกสร้างสถานะ `issued`, demand link ถูกผูก |
| 5 | Purchasing | Import files → Supplier invoice → อัปโหลด PDF | Invoice สถานะ `pending_verification`, พาไปหน้าตรวจสอบ |
| 6 | Purchasing | ตรวจบรรทัด → Verify | reconciliation ถูกสร้าง, บรรทัดที่ตรงถูก approve อัตโนมัติ |
| 7 | Sales | Order allocation → Allocate | ฟอร์มเปิดพร้อมลูกค้าจาก SO |
| 8 | Sales | กด Complete allocation | `unallocated = 0`, สถานะ → `READY_TO_RECEIVE`, แจ้งเตือน Warehouse |
| 9 | Warehouse | Receiving → Receive | ด่านทั้ง 6 เขียว, ฟอร์มรับของแสดง |
| 10 | Warehouse | บันทึกจำนวน/lot/location → Receive and complete | `RCV-…` ถูกสร้าง, PO → `closed` |
| 11 | Warehouse | Shipments → เลือกบรรทัด → Ship | `SHP-…` ถูกสร้าง, SO line → `COMPLETED` |
| 12 | ใครก็ได้ | เปิด `/scm/trace/po/<id>` | stepper เขียวทั้งแถว, ตารางจำนวนครบทุกคอลัมน์, audit trail ครบ |

---

### E2E-02 — Supplier ส่งไม่ครบ (§3.1 + §4.1)

ใช้ข้อมูล seed สถานการณ์ B (`PO-2026-0002`)

| # | ผู้ทำ | ขั้นตอน | ผลที่คาด |
|---|---|---|---|
| 1 | Purchasing | PO vs Invoice | เห็น PO-0002: PO 36 / Invoice 30 / Qty diff −6 (−16.7%) / Price +4.15 (+4%) |
| 2 | Purchasing | กด Review → กด Confirm โดยไม่เลือกเหตุผล | **ปุ่มถูกปิด** และถ้ายิง API ตรงจะได้ **422** พร้อม `field: quantityReason` |
| 3 | Purchasing | เลือก quantity reason + price reason → Confirm | 200, corrected = 30, สร้าง sales review 1 รายการ |
| 4 | Sales | Sales review | เห็น SO-0102: SO 36 vs 30, diff −6 (−16.7%), สถานะ Pending |
| 5 | Sales | Decide → Reduce the order, new qty 30, customer accepted, ใส่เหตุผล | 200, สถานะ completed, SO line quantity = 30, `originalQuantity` ยังเป็น 36 |
| 6 | Sales | ลองใส่ new qty = 40 | **422** `Only 30 was confirmed — the customer cannot be promised 40.` |
| 7 | Warehouse | Receiving | PO-0002 ยังขึ้น **BLOCKED** — "Allocation is complete — 1 line(s) not allocated yet" |
| 8 | Sales | Allocate 30 → Complete | สถานะ → `READY_TO_RECEIVE` |
| 9 | ใครก็ได้ | Exceptions | `EXC-2026-0001` ถูกปิดอัตโนมัติ พร้อม resolution "Confirmed at 30 (SUPPLIER_SHORT_SHIPPED)" |

---

### E2E-03 — Supplier ส่งเกิน / MOQ (§2 + §4.2)

| # | ผู้ทำ | ขั้นตอน | ผลที่คาด |
|---|---|---|---|
| 1 | Purchasing | Order management → เลือก demand 18 Tin ของสินค้าที่ MOQ = 1 BOX (24) | จำนวนตั้งต้นถูกยกเป็น 24, reason ตั้งไว้ให้เป็น MOQ |
| 2 | Purchasing | ลบ reason แล้วกด Issue | **ปุ่มบล็อก + 422** `orders 24 against a demand of 18 — a reason for the extra quantity is required` |
| 3 | Purchasing | ใส่ reason = MOQ → Issue | PO ถูกสร้าง, exception `MOQ` ถูกส่งให้ Sales |
| 4 | Purchasing | Supplier summary | แถวแสดง Required 18 / Order 24 / Diff **+6** / Diff % **+33.3%** / Reason **Minimum order quantity** |
| 5 | Purchasing | กด Export Excel | ไฟล์ .xlsx ดาวน์โหลด มีคอลัมน์ครบตาม §2.1 |
| 6 | Sales | (หลัง invoice + recon) Allocation | Actual 24, ลูกค้า 18 → เหลือ 6 |
| 7 | Sales | กด Complete ทั้งที่เหลือ 6 | **422** `6 still unallocated` |
| 8 | Sales | เพิ่มบรรทัด Warehouse stock 6 แต่ไม่กรอก location | **422** `a storage location is required for stock` |
| 9 | Sales | กรอก location + reason + responsible dept → Complete | 200, `warehouseQuantity = 6`, exception `EXCESS_STOCK` ถูกสร้าง |

---

### E2E-04 — สินค้าชั่งน้ำหนักรายชิ้น (§6.2)

ใช้ข้อมูล seed สถานการณ์ D (`PO-2026-0004`, king crab 20 KG)

| # | ผู้ทำ | ขั้นตอน | ผลที่คาด |
|---|---|---|---|
| 1 | Sales | Allocation → Allocate PO-0004 | เปิดมาพร้อม Mandarin 12 / Phuket 8 |
| 2 | Sales | ลบบรรทัด Phuket แล้วกด Complete | **422** `8 still unallocated` |
| 3 | Sales | คืนบรรทัด → Complete | `ALC-…` completed |
| 4 | Warehouse | Receiving → Receive PO-0004 | ด่าน 6 เขียว, ฟอร์มมีส่วน "Individual items" |
| 5 | Warehouse | กด Receive โดยไม่เพิ่มชิ้น | **422** `is weighed piece by piece — record every item's weight` |
| 6 | Warehouse | Add ten → กรอกน้ำหนัก แต่เว้นลูกค้าบางชิ้น | **422** พร้อมชื่อชิ้นที่ยังไม่จ่าย |
| 7 | Warehouse | จ่ายทุกชิ้น: Mandarin รวม 12.0, Phuket รวม 8.0 | สรุปด้านล่างขึ้น ✓ ทั้งสองบรรทัด |
| 8 | Warehouse | จ่ายให้ Mandarin เกินเป็น 14 | **422** เทียบน้ำหนักที่จ่ายกับที่ allocate ไว้ |
| 9 | Warehouse | Receive and complete | `RCV-…`, actual quantity = ผลรวมน้ำหนักจริง |
| 10 | Warehouse | เปิดหน้า receipt | ตาราง "Weighed items" แสดงทุกชิ้นพร้อมลูกค้า |
| 11 | Warehouse | Shipments → เลือกทั้ง Mandarin และ Phuket | **ปุ่มถูกปิด** + ข้อความ "One shipment goes to one customer" |
| 12 | Warehouse | เลือกเฉพาะ Mandarin → Ship | `SHP-…`, ชิ้นที่ส่งเปลี่ยนสถานะเป็น `shipped` |

---

### E2E-05 — การนำเข้าและ validation (§1.1)

| # | ขั้นตอน | ผลที่คาด |
|---|---|---|
| 1 | อัปโหลดไฟล์ที่ไม่มีคอลัมน์ `รหัสสินค้า` | **422** `The file is missing required column(s): productCode` |
| 2 | อัปโหลดไฟล์ที่มี header ภาษาไทย | จับคู่คอลัมน์ได้ถูกทุกช่อง |
| 3 | แถวรหัสสินค้าไม่มีใน master | 🔴 `Product code X is not in the product master` + "This row will not be imported" |
| 4 | แถวจำนวน 0 | 🔴 `Quantity 0 must be greater than zero` |
| 5 | แถววันที่ `not-a-date` | 🔴 `"not-a-date" is not a valid delivery date` |
| 6 | แถวซ้ำ (PR+SO+PO+สินค้า+วันที่) | 🔴 `already appears earlier in the file` |
| 7 | แถวหน่วย BOX (master = Tin) | 🟡 `2 BOX converted to 24 TIN` และ `baseQuantity = 24` |
| 8 | แถวมี PR/SO แต่ไม่มี PO | 🟡 `No PO yet — the line goes to Order management` |
| 9 | กด Import | เฉพาะแถวที่ไม่มี error เข้าระบบ, จำนวนตรงกับที่ preview บอก |
| 10 | อัปโหลดไฟล์ PO ที่อ้าง PO number เดิม | demand ที่ค้างถูกผูกให้อัตโนมัติ, `requiredQuantity` ถูกคำนวณใหม่ |
| 11 | กด Import ซ้ำด้วย batch เดิม | **409** `This file has already been imported.` |

---

### E2E-06 — สิทธิ์และการกั้นตามแผนก (§10, §21)

| # | ผู้ใช้ | ขั้นตอน | ผลที่คาด |
|---|---|---|---|
| 1 | ผู้ใช้ใหม่ (department = none) | เปิด `/scm` | หน้า "No access yet" พร้อมวิธีขอสิทธิ์ |
| 2 | Admin | Settings → Users → ตั้ง department = warehouse | บันทึก + audit log บันทึก old → new |
| 3 | Warehouse | ดู sidebar | เห็นเฉพาะ Workflow, Import, Allocation, Receiving, Shipments, Exceptions |
| 4 | Warehouse | ยิง `POST /api/scm/purchase-orders` ตรง ๆ | **403** `Your department (warehouse) is not allowed to purchasing → createPo` |
| 5 | Sales | ยิง `POST /api/scm/receiving` ตรง ๆ | **403** |
| 6 | Management | เปิดทุกกระดาน | เห็นข้อมูลครบ แต่ไม่มีปุ่มลงมือ |
| 7 | Management | เปิด `/scm/master-data` | "No access yet" (admin เท่านั้น) |

---

### E2E-07 — Audit trail (§12)

| # | ขั้นตอน | ผลที่คาด |
|---|---|---|
| 1 | แก้จำนวนบรรทัด Invoice จาก 36 → 30 แล้ว Save | audit row: field `quantity`, old 36, new 30, reason "Manual correction after extraction"; หน้าจอขึ้นไอคอน ✎ corrected |
| 2 | ยืนยัน corrected quantity | audit 2 แถว: status → approved, correctedQuantity 36 → 30 พร้อมเหตุผล |
| 3 | Sales ลด SO 36 → 30 | audit: field `soQuantity` 36 → 30, reason ที่กรอก; `originalQuantity` ในฐานข้อมูลยังเป็น 36 |
| 4 | เปิด `/scm/audit` ค้น `PO-2026-0002` | เห็นทุกแถวเรียงใหม่ไปเก่า |
| 5 | กด Export Excel | ไฟล์มีคอลัมน์ When / User / Department / Document / Entity / Action / Field / Old / New / Reason |
| 6 | เปิด `/scm/trace/po/<id>` | ส่วน "Audit trail for PO-…" แสดงเฉพาะของเอกสารใบนั้น |

---

### E2E-09 — Cross-channel shortage (§20, §45)

ใช้ข้อมูล seed สถานการณ์ E (`SHT-2026-0001`)

| # | ผู้ทำ | ขั้นตอน | ผลที่คาด |
|---|---|---|---|
| 1 | Sales (FS) | เปิด Customer allocation ของ PO-2026-0005 | ปุ่ม Allocate ถูกปิด พร้อมลิงก์ไป `SHT-2026-0001` |
| 2 | Sales (FS) | ยิง `POST /api/scm/allocations` ตรง ๆ | **409** `Cross-channel shortage SHT-2026-0001 is waiting for a management decision` |
| 3 | Sales (FS) | ยิง `POST /api/scm/shortage` | **403** — Sales ของ channel เดียวอนุมัติไม่ได้ |
| 4 | Management | เปิด `/scm/sales/shortage/<id>` | เห็น demand แยกตาม channel, ช่อง Approved **ว่างเปล่า**, ปุ่ม Approve ถูกปิด |
| 5 | Management | กด "Fill in the proposal" | เติม FS 1,000 / RTL 150 ตาม priority — ยังแก้ได้ |
| 6 | Management | ใส่ FS 1,000 + RTL 100 (รวม 1,100) | **422** `50 still unassigned — the approved quantities must add up to the 1150 received` |
| 7 | Management | ใส่ FS 1,150 + RTL 0 | **422** `1150 is more than the 1000 ordered` |
| 8 | Management | ใส่ FS 1,000 + RTL 150 + เหตุผล → Approve | 200 `{ status: "applied", approvedTotal: 1150 }` |
| 9 | ใครก็ได้ | ดู SO-2026-0202 | `quantity` = 150, `originalQuantity` ยังเป็น 500 |
| 10 | ใครก็ได้ | ดู audit trail ของ `SHT-2026-0001` | มีแถว approve + แถวที่จำนวน SO เปลี่ยน พร้อมชื่อผู้อนุมัติ |
| 11 | Sales (RTL) | เปิด Customer allocation | ปุ่ม Allocate ใช้งานได้แล้ว |
| 12 | ใครก็ได้ | Exception Center | `EXC-2026-0004` ถูกปิดอัตโนมัติ |

---

### E2E-10 — Channel permission (§39)

| # | ผู้ทำ | ขั้นตอน | ผลที่คาด |
|---|---|---|---|
| 1 | Admin | Settings → Users → ตั้ง department = sales, ติ๊กเฉพาะ `RTL` | บันทึก + audit บันทึก old → new |
| 2 | Sales (RTL) | เปิด Sales review | เห็นเฉพาะ SO ของ Retail |
| 3 | Sales (RTL) | ใส่ `?channel=<FS id>` ใน URL | **ไม่เห็นอะไรเลย** — ไม่ใช่เห็นทุก channel |
| 4 | Sales (RTL) | เปิด Dashboard | ตาราง By business channel มีแถวเดียว: RTL |
| 5 | Sales (RTL) | เปิด Purchase planning | เห็นเฉพาะ demand ของ Retail |
| 6 | Admin | เปลี่ยนเป็น **Manager · all** | Sales คนเดิมเห็นทั้ง 4 channel และอนุมัติ shortage ได้ |
| 7 | Admin | Master data → เพิ่ม channel `WHS` Wholesale | ปรากฏใน filter, permission และ report ทันที **โดยไม่ต้อง deploy** |
| 8 | ผู้ใช้ที่ยังไม่มี channel | เปิด Sales review | ไม่เห็นรายการใด ๆ (ไม่ใช่เห็นทั้งหมด) |

---

### E2E-11 — Partial receiving (§23)

| # | ขั้นตอน | ผลที่คาด |
|---|---|---|
| 1 | รับ 10 จาก 24 ที่ยืนยันไว้ | `RCV-…` ถูกสร้าง, บรรทัด **PARTIALLY_RECEIVED**, PO ยัง `received` |
| 2 | เปิดหน้า Receive อีกครั้ง | จำนวนตั้งต้นเป็น 14 (ส่วนที่เหลือ) และแสดง "10 already received" |
| 3 | พยายามรับอีก 20 | **422** `10 already received, 20 more would exceed the confirmed 24` |
| 4 | รับอีก 14 | บรรทัดเป็น **FULLY_RECEIVED** → **READY_TO_SHIP**, PO `closed` |

---

### E2E-12 — Warehouse stock (§24)

| # | ขั้นตอน | ผลที่คาด |
|---|---|---|
| 1 | Allocate 6 ชิ้นเข้าคลัง พร้อม location/reason/dept แล้วรับของ | `STK-…` ถูกสร้างอัตโนมัติ |
| 2 | เปิด Warehouse stock | เห็น supplier, PO, invoice, **SO ต้นทาง**, channel, lot, expiry |
| 3 | กด Move → เลือก "Out" โดยไม่ใส่เหตุผล | ถูกปฏิเสธ — reason เป็นค่าบังคับ |
| 4 | ย้ายออก 200 จากยอด 100 | **422** `Only 100 on hand` |
| 5 | ย้ายออก 40 พร้อมเหตุผล | ยอดเหลือ 60, มี transaction พร้อม balanceAfter และ audit |

---

### E2E-13 — Tolerance (§28)

| # | ขั้นตอน | ผลที่คาด |
|---|---|---|
| 1 | ตั้ง global 0% แล้วอัปโหลด invoice ที่ต่าง 1% | ขึ้นเป็น Pending review |
| 2 | เพิ่มกฎ supplier = Nordic Seafood 2% | invoice ของ supplier นั้นที่ต่าง 1% ถูก **auto-approve** |
| 3 | invoice ของ supplier อื่นที่ต่าง 1% | ยังคง Pending review — กฎไม่รั่วข้าม supplier |
| 4 | เพิ่มกฎ channel = Store 5% และ supplier 2% พร้อมกัน | supplier ชนะ — ใช้ 2% |

---

### E2E-08 — Receiving gate ทั้ง 6 ด่าน (§22)

| ด่านที่ทำให้ไม่ผ่าน | วิธีสร้างสถานการณ์ | ข้อความที่คาด |
|---|---|---|
| 1 PO | ตั้ง PO เป็น `draft` | "The purchase order is still a draft — issue it first." |
| 2 Invoice | ยังไม่อัปโหลด Invoice | "No supplier invoice uploaded for this PO." |
| 3 Qty recon | Invoice verified แต่ยังไม่ confirm ความต่าง | "N line(s) still pending purchasing review." |
| 4 Sales recon | มี sales review ค้าง | "N sales review(s) still open." |
| 4 Sales recon | มี cross-channel shortage ค้าง | "Cross-channel shortage SHT-… is waiting for a management decision." |
| 5 Allocation | ยังไม่ allocate | "N line(s) not allocated yet." |
| 6 Unallocated | allocate ไม่ครบ | "UNALLOCATED QUANTITY: X." |

ทุกกรณี: หน้าจอขึ้น **BLOCKED** พร้อมด่านที่ไม่ผ่าน และ API ตอบ **409**
แม้จะยิงตรง
