# 4. Workflow Status Diagram

## 1. Status engine (§42)

ทุก demand line (PR line, SO line) และทุก PO line ถือสถานะจากชุดเดียวกันนี้
สถานะถูก **คำนวณใหม่จากเอกสารจริงเสมอ** (`resolveStatus()` ใน
`lib/scm/status.ts`) แล้วเก็บลงคอลัมน์เพื่อให้ filter/index ได้ — เอกสารคือ
ความจริง คอลัมน์เป็นแค่ cache

### สายหลัก 18 สถานะ

| # | สถานะ | สี | ความหมาย |
|---|---|---|---|
| 1 | `IMPORTED` | เทา | นำเข้าแล้ว ยังไม่เริ่มกระบวนการ |
| 2 | `PENDING_PO` | เหลือง | รอเปิด PO / PO ยังไม่ครอบคลุม demand |
| 3 | `PO_CREATED` | น้ำเงิน | เปิด PO แล้ว |
| 4 | `PENDING_INVOICE` | เหลือง | รอ Invoice จาก Supplier |
| 5 | `INVOICE_UPLOADED` | น้ำเงิน | อัปโหลด Invoice แล้ว |
| 6 | `PENDING_RECONCILIATION` | เหลือง | มีความต่าง รอ Purchasing ยืนยัน |
| 7 | `RECONCILED` | น้ำเงิน | PO/Invoice ตรงกันหรือได้รับการยืนยันแล้ว |
| 8 | `PENDING_SALES_REVIEW` | เหลือง | จำนวนต่างจาก SO รอ Sales ตัดสินใจ |
| 9 | `SALES_REVIEW_COMPLETED` | น้ำเงิน | Sales ตัดสินใจแล้ว |
| 10 | `PENDING_ALLOCATION` | เหลือง | รอจัดสรรให้ลูกค้า/คลัง |
| 11 | `ALLOCATION_COMPLETED` | น้ำเงิน | จัดสรรครบ (unallocated = 0) |
| 12 | `READY_TO_RECEIVE` | น้ำเงิน | ผ่านครบ 6 ด่าน คลังรับของได้ |
| 13 | `RECEIVED` | น้ำเงิน | มีใบรับแล้ว |
| 14 | `PARTIALLY_RECEIVED` | เหลือง | รับมาบางส่วน ยังรอส่วนที่เหลือ |
| 15 | `FULLY_RECEIVED` | น้ำเงิน | รับครบตามจำนวนที่ยืนยัน |
| 16 | `READY_TO_SHIP` | น้ำเงิน | พร้อมจัดส่งให้ลูกค้า |
| 17 | `SHIPPED` | น้ำเงิน | ส่งออกจากคลังแล้ว |
| 18 | `COMPLETED` | เขียว | ทุกบรรทัดของลูกค้าถึงปลายทาง |

### สถานะพิเศษ 4 สถานะ

| สถานะ | สี | ความหมาย | กลับเข้าสายหลักได้ |
|---|---|---|:--:|
| `BLOCKED` | แดง | ติดปัญหา มีเหตุผลกำกับ | ✓ |
| `EXCEPTION` | แดง | **รอการอนุมัติ** เช่น cross-channel shortage | ✓ |
| `REJECTED` | แดง | ถูกปฏิเสธ (เช่น reconciliation) | ✕ |
| `CANCELLED` | เทา | ยกเลิก | ✕ |

> **`BLOCKED` ต่างจาก `EXCEPTION` อย่างไร** — `BLOCKED` คือมีอะไรผิดพลาดและ
> ต้องแก้ ส่วน `EXCEPTION` คือระบบกำลัง *รอการตัดสินใจ* ที่ถูกต้องตามกระบวนการ
> เช่น shortage ข้าม channel ที่รอผู้บริหารจัดลำดับ (§20) — ไม่ใช่ความผิดพลาด
> แต่เป็นจุดที่ workflow ตั้งใจหยุด

## 2. State machine

```mermaid
stateDiagram-v2
  [*] --> IMPORTED

  IMPORTED --> PENDING_PO : demand ยังไม่มี PO
  IMPORTED --> PO_CREATED : ไฟล์อ้าง PO อยู่แล้ว
  PENDING_PO --> PO_CREATED : Purchasing เปิด PO

  PO_CREATED --> PENDING_INVOICE : PO ครอบคลุม demand
  PENDING_INVOICE --> INVOICE_UPLOADED : อัปโหลด Invoice
  PO_CREATED --> INVOICE_UPLOADED

  INVOICE_UPLOADED --> PENDING_RECONCILIATION : พบความต่างเกิน tolerance
  INVOICE_UPLOADED --> RECONCILED : อยู่ใน tolerance (auto)
  PENDING_RECONCILIATION --> RECONCILED : Purchasing ยืนยัน + เหตุผล

  RECONCILED --> PENDING_SALES_REVIEW : จำนวนต่างจาก SO
  RECONCILED --> PENDING_ALLOCATION : ตรงกับ SO
  PENDING_SALES_REVIEW --> SALES_REVIEW_COMPLETED : Sales ตัดสินใจ + เหตุผล
  SALES_REVIEW_COMPLETED --> PENDING_ALLOCATION

  PENDING_ALLOCATION --> ALLOCATION_COMPLETED : unallocated = 0
  ALLOCATION_COMPLETED --> READY_TO_RECEIVE : ผ่านครบ 6 ด่าน

  READY_TO_RECEIVE --> RECEIVED
  RECEIVED --> PARTIALLY_RECEIVED : ยังได้ไม่ครบ
  PARTIALLY_RECEIVED --> FULLY_RECEIVED : ส่งงวดถัดไปครบ
  RECEIVED --> FULLY_RECEIVED : ครบในงวดเดียว
  FULLY_RECEIVED --> READY_TO_SHIP
  READY_TO_SHIP --> SHIPPED --> COMPLETED

  RECONCILED --> EXCEPTION : cross-channel shortage (§20)
  EXCEPTION --> PENDING_ALLOCATION : ผู้บริหารอนุมัติการแบ่ง
  PENDING_RECONCILIATION --> REJECTED : Purchasing ปฏิเสธ
  PENDING_ALLOCATION --> BLOCKED
  READY_TO_RECEIVE --> BLOCKED
  BLOCKED --> PENDING_ALLOCATION : แก้ปัญหาแล้ว

  IMPORTED --> CANCELLED
  PO_CREATED --> CANCELLED

  COMPLETED --> [*]
  REJECTED --> [*]
  CANCELLED --> [*]
```

## 3. กติกาการเปลี่ยนสถานะ (§21, §43 Rule 3)

`canTransition(from, to)` บังคับว่า:

1. **เดินตามลำดับเท่านั้น** — ข้ามขั้นไม่ได้
   `canTransition("PO_CREATED", "READY_TO_RECEIVE") === false`
   `canTransition("PARTIALLY_RECEIVED", "SHIPPED") === false`
2. **BLOCKED / EXCEPTION / REJECTED / CANCELLED เข้าถึงได้จากทุกสถานะ**
3. **BLOCKED และ EXCEPTION กลับเข้าสายหลักได้** เมื่อปัญหาถูกแก้หรืออนุมัติแล้ว
4. **REJECTED, CANCELLED และ COMPLETED เป็นปลายทาง**

ครอบคลุมด้วยเทสต์ใน `tests/scm-status.test.ts`

## 4. ตารางเงื่อนไขการคำนวณสถานะ

`resolveStatus(facts)` ตัดสินตามลำดับนี้ (เจอเงื่อนไขแรกที่จริง = ได้สถานะนั้น):

| ลำดับ | เงื่อนไข | สถานะ |
|---:|---|---|
| 1 | `cancelled` | `CANCELLED` |
| 2 | `rejected` | `REJECTED` |
| 3 | `blocked` | `BLOCKED` |
| 4 | `exception` (มี shortage case รออนุมัติ) | `EXCEPTION` |
| 5 | `completed` (ทุกบรรทัดลูกค้าส่งครบ) | `COMPLETED` |
| 6 | `shipped` | `SHIPPED` |
| 7 | `readyToShip` | `READY_TO_SHIP` |
| 8 | `fullyReceived` | `FULLY_RECEIVED` |
| 9 | `partiallyReceived` | `PARTIALLY_RECEIVED` |
| 10 | `received` | `RECEIVED` |
| 11 | `allocationCompleted` | `READY_TO_RECEIVE` |
| 12 | `allocationRequired` | `PENDING_ALLOCATION` |
| 13 | `salesReviewRequired && !salesReviewDone` | `PENDING_SALES_REVIEW` |
| 14 | `salesReviewDone` | `SALES_REVIEW_COMPLETED` |
| 15 | `poInvoiceOpen` | `PENDING_RECONCILIATION` |
| 16 | `poInvoiceApproved` | `RECONCILED` |
| 17 | `hasInvoice` | `INVOICE_UPLOADED` |
| 18 | `poQuantity < requiredQuantity` (หรือ = 0) | `PENDING_PO` |
| 19 | อื่น ๆ | `PENDING_INVOICE` |

**Partial vs Fully received (§23)** ตัดสินจาก *ผลรวมสะสมข้ามใบรับ* เทียบกับ
จำนวนที่ Purchasing ยืนยัน ไม่ใช่จำนวนใบรับ:

```
PO = 1,000 KG (confirmed)
Delivery 1 = 600  → รวม 600  < 1,000 → PARTIALLY_RECEIVED
Delivery 2 = 400  → รวม 1,000 = 1,000 → FULLY_RECEIVED → READY_TO_SHIP
```

## 5. Progress stepper บนหน้าเอกสาร

หน้ารายละเอียดเอกสาร (`/scm/trace/…`) แสดงขั้นตอนตาม §19:

```
SO/PR → PO → Invoice → Reconciliation → Sales review → Allocation → Receiving → Shipment
```

โดยระบายสี: **เขียว** = ผ่านแล้ว, **น้ำเงิน** = กำลังทำ, **เทา** = ยังไม่เริ่ม,
**แดง** = ติดปัญหาหรือรออนุมัติที่ขั้นนั้น
