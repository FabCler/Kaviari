# 3. User Role & Permission Matrix

## 1. แผนก (Departments)

ผู้ใช้แต่ละคนมี `department` หนึ่งค่า ซึ่งเป็นตัวกำหนดสิทธิ์ทั้งหมด
บัญชี **owner** (ตรงกับ `OWNER_EMAIL`) เป็น **admin** เสมอไม่ว่าจะตั้ง
department ไว้เป็นอะไร

| Department | ใครใช้ | เห็นเมนู |
|---|---|---|
| `admin` | ผู้ดูแลระบบ / owner | ทุกเมนู |
| `purchasing` | แผนกจัดซื้อ | Import, Order management, Supplier summary, Invoices, PO vs Invoice, PO vs SO, Exceptions |
| `sales` | แผนกขาย | Import (SO), Sales review, Order allocation, PO vs SO, Exceptions |
| `warehouse` | คลังสินค้า | Receiving, Shipments, Order allocation, Exceptions |
| `management` | ผู้บริหาร | Dashboard, ทุกกระดานแบบอ่านอย่างเดียว, Audit trail |
| `none` | ยังไม่กำหนด | ไม่เห็นโมดูลนี้ — ขึ้นข้อความให้ติดต่อ admin |

กำหนดแผนกที่ **Settings → Users** (owner เท่านั้น) การเปลี่ยนแผนกถูกบันทึกลง
audit trail ทุกครั้ง

## 2. Permission matrix

`●` = ทำได้ · `–` = ทำไม่ได้ (ที่มา: `lib/scm/permissions.ts`)

| Permission | คำอธิบาย | Admin | Purchasing | Sales | Warehouse | Management |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `import.demand` | นำเข้าไฟล์ PR/SO จากจัดซื้อ | ● | ● | ● | – | – |
| `import.po` | นำเข้าไฟล์ PO | ● | ● | – | – | – |
| `import.so` | นำเข้าไฟล์ SO จากฝ่ายขาย | ● | – | ● | – | – |
| `import.invoice` | อัปโหลด Invoice จาก Supplier | ● | ● | – | – | – |
| `purchasing.view` | ดูกระดานจัดซื้อ | ● | ● | – | – | ● |
| `purchasing.createPo` | สร้าง PO | ● | ● | – | – | – |
| `purchasing.editPo` | แก้ไข PO | ● | ● | – | – | – |
| `purchasing.reconcilePoInvoice` | ตรวจ/แก้ Invoice ที่อ่านมา | ● | ● | – | – | – |
| `purchasing.approveVariance` | อนุมัติจำนวน/ราคาที่ต่างกัน | ● | ● | – | – | – |
| `sales.view` | ดูกระดานขาย | ● | – | ● | – | ● |
| `sales.reviewDifference` | ตัดสินใจเรื่องจำนวนที่ต่าง | ● | – | ● | – | – |
| `sales.adjustSo` | แก้จำนวน SO | ● | – | ● | – | – |
| `sales.allocate` | จัดสรรสินค้าให้ลูกค้า/คลัง | ● | – | ● | ● | – |
| `warehouse.view` | ดูกระดานคลัง | ● | – | – | ● | ● |
| `warehouse.receive` | ยืนยันการรับสินค้า | ● | – | – | ● | – |
| `warehouse.recordWeights` | ชั่งน้ำหนักรายชิ้น | ● | – | – | ● | – |
| `warehouse.ship` | ยืนยันการส่งสินค้า | ● | – | – | ● | – |
| `exceptions.manage` | จัดการ exception | ● | ● | ● | ● | – |
| `documents.view` | เปิดดูเอกสาร/trace | ● | ● | ● | ● | ● |
| `dashboard.view` | ดู dashboard | ● | ● | ● | ● | ● |
| `master.manage` | จัดการ master data + tolerance | ● | – | – | – | – |
| `users.manage` | จัดการผู้ใช้และสิทธิ์ | ● | – | – | – | – |
| `audit.view` | ดู audit log | ● | – | – | – | ● |
| `override` | override ธุรกรรมโดยได้รับอนุมัติ | ● | – | – | – | – |

> **Warehouse ได้ `sales.allocate` ด้วย** — ในทางปฏิบัติสินค้าชั่งน้ำหนัก
> (ปลา/ปู) ต้องจับคู่ชิ้นต่อลูกค้าตอนของมาถึง คลังจึงต้องแก้ allocation ได้
> ที่หน้ารับของ การแก้ทุกครั้งยังถูกบันทึก audit ตามปกติ

## 3. การบังคับใช้ (Enforcement)

สิทธิ์ถูกตรวจ **สามชั้น** และทั้งสามชั้นอ่าน matrix เดียวกัน:

| ชั้น | ที่ไหน | ทำอะไร |
|---|---|---|
| Navigation | `components/app-shell.tsx` | ซ่อนเมนูที่แผนกนั้นเข้าไม่ได้ |
| Page | `app/(app)/scm/**/page.tsx` | เรียก `can(actor, …)` — ไม่ผ่านแสดง `<NoAccess />` และซ่อนปุ่มลงมือ |
| API | `app/api/scm/**/route.ts` | `requirePermission()` → 401/403 ก่อนแตะฐานข้อมูล |

**การซ่อนปุ่มไม่ใช่การควบคุมสิทธิ์** — ทุก route handler ตรวจซ้ำเสมอ
ต่อให้ client ยิงตรงเข้ามาก็ถูกปฏิเสธ

```ts
// app/api/scm/purchase-orders/route.ts
const actor = await requirePermission("purchasing.createPo");
if (isResponse(actor)) return actor;   // 401 หรือ 403 พร้อมเหตุผล
```

## 4. สิ่งที่แผนกทำได้ตามสเปค §10

### Purchasing
Import PR/SO · Create/Edit PO Plan · Assign Supplier · Edit Order Quantity ·
Upload Invoice · Reconcile PO vs Invoice · Approve Quantity/Price Adjustment

### Sales
Import SO · Review Quantity Difference · Contact Customer (บันทึก
`customerAccepted` + เหตุผล) · Adjust SO · Allocate Customer ·
Decide Excess Quantity → Customer / Warehouse

### Warehouse
View Ready to Receive · Confirm Receiving · Record Actual Quantity ·
Weigh Individual Items · Record Lot/Batch · Record Storage Location ·
Execute Customer Allocation · Confirm Shipment

### Admin
Manage Master Data · Manage Users · Manage Permission · Manage Tolerance ·
View Audit Log · Override transaction with approval
