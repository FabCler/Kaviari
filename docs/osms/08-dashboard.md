# 8. Dashboard Design

## 1. โครงหน้า

`/osms` แสดง 4 กลุ่มเรียงจากภาพรวมไปรายละเอียด แต่ละกลุ่มจะแสดงก็ต่อเมื่อ
ผู้ใช้มีสิทธิ์ดูแผนกนั้น (management และ admin เห็นทุกกลุ่ม)

**ตัวเลขทุกตัวกดได้** และพาไปที่คิวที่มันนับมา — ตัวเลขบน dashboard ที่กดไม่ได้
คือทางตัน

## 2. Management (§9)

| Card | ที่มา |
|---|---|
| Total PO | `count(purchase_orders)` |
| Total SO | `count(sales_orders)` |
| Total Invoice | `count(invoices)` |
| Total Received | `Σ receiving_lines.actualQuantity` |
| Total Customer Allocation | `Σ allocation.allocatedQuantity` |
| Total Warehouse Stock | `Σ allocation.warehouseQuantity` |
| Quantity Variance | `Σ |po_invoice_reconciliation.qtyDiff|` |
| Price Variance | `Σ |po_invoice_reconciliation.priceDiff|` |

**Supplier performance** — ตารางแยกตาม Supplier: จำนวนบรรทัด, จำนวนที่ไม่ตรง,
% ที่ส่งตรงสเปค (`(lines − mismatches) / lines × 100`)

## 3. Purchasing

| Card | ที่มา | สี |
|---|---|---|
| PO Pending | line ที่สถานะ `PO_CREATED` หรือ `PENDING_INVOICE` | ปกติ |
| Invoice mismatch | recon ที่ยังไม่ approved | 🔴 ถ้า > 0 |
| Quantity difference | ผลรวมส่วนต่างจำนวน | 🟡 ถ้า > 0 |
| Price difference | ผลรวมส่วนต่างราคา | 🟡 ถ้า > 0 |
| PO without invoice | PO ที่ยังไม่มี Invoice และไม่ใช่ draft/cancelled | ปกติ |

## 4. Sales

| Card | ที่มา | สี |
|---|---|---|
| SO ≠ actual | so_po_recon ที่ `diffStatus ≠ match` | 🟡 |
| To ask the customer | so_po_recon ที่ `pending_sales_review` | 🔴 |
| To reduce | `diffStatus = short` | ปกติ |
| Supplier over-shipped | `diffStatus = over` | ปกติ |
| Kept as stock | `decision = warehouse_stock` | ปกติ |

## 5. Warehouse

| Card | ที่มา | สี |
|---|---|---|
| Shipments today | shipment ที่ `shipDate` เป็นวันนี้ | ปกติ |
| Ready to receive | PO line สถานะ `READY_TO_RECEIVE` | 🟢 |
| Pending allocation | PO line สถานะ `PENDING_ALLOCATION` | 🟡 |
| Received | PO line สถานะ `RECEIVED` หรือ `COMPLETED` | ปกติ |
| Blocked | PO line สถานะ `BLOCKED` | 🔴 |
| Unallocated quantity | `Σ allocation.unallocatedQuantity` | 🔴 ถ้า > 0 |

## 6. แผงล่าง

### Lines needing attention
บรรทัดที่สถานะเป็น `BLOCKED`, `PENDING_SALES_REVIEW` หรือ `PENDING_ALLOCATION`
เรียงตามวันส่งที่ใกล้ที่สุด แสดง PO / สินค้า / วันส่ง / สถานะ

### Notifications
แจ้งเตือนที่ยังไม่อ่านของแผนกผู้ใช้ พร้อมลิงก์ตรงไปหน้าที่ต้องลงมือ

### Open exceptions
Exception ที่ `open`/`in_progress` เรียงตามความรุนแรง แสดงรหัส คำอธิบาย
แผนกที่รับผิดชอบ และกำหนดเสร็จ

## 7. หลักการนำเสนอตัวเลข

- ใช้ **tabular numerals** (`.tnum`) ทุกคอลัมน์ตัวเลขเพื่อให้หลักตรงกัน
- ส่วนต่างบวก = 🟡 เหลือง (ของเกิน — ต้องหาที่ไป), ส่วนต่างลบ = 🔴 แดง
  (ของขาด — ลูกค้ากระทบ), 0 = สีปกติ
- `Unallocated > 0` เป็นสีแดงเสมอ เพราะเป็นสิ่งเดียวที่กั้นคลังไม่ให้รับของ
- ไม่ใช้กราฟบน dashboard นี้โดยตั้งใจ — งานประจำวันคือคิวที่ต้องเคลียร์
  ไม่ใช่แนวโน้ม กราฟแนวโน้มอยู่ที่หน้า Consumption analysis ของแอปเดิม
