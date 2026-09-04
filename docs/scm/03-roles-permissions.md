# 3. User Role & Permission Matrix

## 1. แผนก + Business Channel (Departments & channels)

สิทธิ์ในระบบนี้มี **สองมิติ** (§39):

1. **Department** — ทำอะไรได้ (สร้าง PO, ยืนยัน invoice, รับของ…)
2. **Business Channel** — เห็นข้อมูลของ channel ไหน

ผู้ใช้แต่ละคนมี `department` หนึ่งค่า บัญชี **owner** (ตรงกับ `OWNER_EMAIL`)
เป็น **admin** เสมอไม่ว่าจะตั้ง department ไว้เป็นอะไร

| Department | ใครใช้ | เห็นเมนู |
|---|---|---|
| `admin` | ผู้ดูแลระบบ / owner | ทุกเมนู |
| `purchasing` | แผนกจัดซื้อ | Import, Order management, Supplier summary, Invoices, PO vs Invoice, PO vs SO, Exceptions |
| `sales` | แผนกขาย | Import (SO), Sales review, Customer allocation, Channel shortage, PO vs SO, Exceptions |
| `warehouse` | คลังสินค้า | Receiving, Warehouse stock, Shipments, Customer allocation, Exceptions |
| `management` | ผู้บริหาร | Dashboard, ทุกกระดานแบบอ่านอย่างเดียว, Performance, Audit trail |
| `none` | ยังไม่กำหนด | ไม่เห็นโมดูลนี้ — ขึ้นข้อความให้ติดต่อ admin |

### มิติที่สอง — Business Channel

| Department | เห็น channel ไหน |
|---|---|
| `sales` (ทั่วไป) | เฉพาะ channel ที่ได้รับมอบหมาย |
| `sales` + `allChannels` = **Sales Manager** | ทุก channel รวมที่เพิ่มในอนาคต |
| `purchasing` / `warehouse` / `management` / `admin` | ทุก channel เสมอ |
| `sales` ที่ยังไม่ได้รับ channel ใด ๆ | **ไม่เห็นอะไรเลย** (ไม่ใช่เห็นทุกอย่าง) |

ตัวอย่างตามสเปค §39:

```
Sales User · Channel = Food Service   → เห็นเฉพาะ FS
Sales Manager                          → เห็น FS + Retail + Store + Central Kitchen
Warehouse                              → เห็นทุก channel
Management                             → เห็นทุกอย่าง
Admin                                  → Full access
```

รายละเอียดการทำงานอยู่ใน [13-business-channels.md](13-business-channels.md#3-สิทธิ์ตาม-channel-§42-§39)

กำหนดแผนกที่ **Settings → Users** (owner เท่านั้น) การเปลี่ยนแผนกถูกบันทึกลง
audit trail ทุกครั้ง

## 2. Permission matrix

`●` = ทำได้ · `–` = ทำไม่ได้ (ที่มา: `lib/scm/permissions.ts`)
**Sales mgr** คือ sales ที่ตั้ง `allChannels`

| Permission | คำอธิบาย | Admin | Purch. | Sales | Sales mgr | Wh. | Mgmt |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `import.demand` | นำเข้าไฟล์ PR/SO จากจัดซื้อ | ● | ● | ● | ● | – | – |
| `import.po` | นำเข้าไฟล์ PO | ● | ● | – | – | – | – |
| `import.so` | นำเข้าไฟล์ SO จากฝ่ายขาย | ● | – | ● | ● | – | – |
| `import.invoice` | อัปโหลด Invoice จาก Supplier | ● | ● | – | – | – | – |
| `purchasing.view` | ดูกระดานจัดซื้อ | ● | ● | – | – | – | ● |
| `purchasing.createPo` | สร้าง PO | ● | ● | – | – | – | – |
| `purchasing.editPo` | แก้ไข PO | ● | ● | – | – | – | – |
| `purchasing.reconcilePoInvoice` | ตรวจ/แก้ Invoice ที่อ่านมา | ● | ● | – | – | – | – |
| `purchasing.approveVariance` | อนุมัติจำนวน/ราคาที่ต่างกัน | ● | ● | – | – | – | – |
| `sales.view` | ดูกระดานขาย | ● | – | ● | ● | – | ● |
| `sales.reviewDifference` | ตัดสินใจเรื่องจำนวนที่ต่าง | ● | – | ● | ● | – | – |
| `sales.adjustSo` | แก้จำนวน SO | ● | – | ● | ● | – | – |
| `sales.allocate` | จัดสรรสินค้าให้ลูกค้า/คลัง | ● | – | ● | ● | ● | – |
| **`shortage.approve`** | **อนุมัติการแบ่งข้าม channel (§20)** | ● | – | **–** | **●** | – | ● |
| `warehouse.view` | ดูกระดานคลัง | ● | – | – | – | ● | ● |
| `warehouse.receive` | ยืนยันการรับสินค้า | ● | – | – | – | ● | – |
| `warehouse.recordWeights` | ชั่งน้ำหนักรายชิ้น | ● | – | – | – | ● | – |
| `warehouse.ship` | ยืนยันการส่งสินค้า | ● | – | – | – | ● | – |
| `warehouse.stock` | จัดการ stock / leftover | ● | – | – | – | ● | ● |
| `exceptions.manage` | จัดการ exception | ● | ● | ● | ● | ● | – |
| `documents.view` | เปิดดูเอกสาร/trace | ● | ● | ● | ● | ● | ● |
| `dashboard.view` | ดู dashboard | ● | ● | ● | ● | ● | ● |
| `reports.view` | ดู performance report | ● | ● | ● | ● | ● | ● |
| `master.manage` | จัดการ master data + tolerance | ● | – | – | – | – | – |
| `users.manage` | จัดการผู้ใช้และสิทธิ์ | ● | – | – | – | – | – |
| `channels.manage` | จัดการ business channel | ● | – | – | – | – | – |
| `audit.view` | ดู audit log | ● | – | – | – | – | ● |
| `override` | override ธุรกรรมโดยได้รับอนุมัติ | ● | – | – | – | – | – |

> **ทำไม Sales ธรรมดาอนุมัติ shortage ไม่ได้** — การแบ่งของที่ไม่พอระหว่าง
> channel คือการตัดสินใจแทน channel อื่น Sales ของ Food Service ไม่ควรตัด
> Retail ได้ (§20 "ห้ามระบบตัดสินใจเองโดยไม่มี Rule/Approval" — และห้าม
> ฝ่ายที่มีส่วนได้เสียตัดสินใจฝ่ายเดียวด้วย)

> **Warehouse ได้ `sales.allocate` ด้วย** — ในทางปฏิบัติสินค้าชั่งน้ำหนัก
> (ปลา/ปู) ต้องจับคู่ชิ้นต่อลูกค้าตอนของมาถึง คลังจึงต้องแก้ allocation ได้
> ที่หน้ารับของ การแก้ทุกครั้งยังถูกบันทึก audit ตามปกติ

## 3. การบังคับใช้ (Enforcement)

สิทธิ์ถูกตรวจ **สามชั้น** และทั้งสามชั้นอ่าน matrix เดียวกัน:

| ชั้น | ที่ไหน | ทำอะไร |
|---|---|---|
| Navigation | `components/app-shell.tsx` | ซ่อนเมนูที่แผนกนั้นเข้าไม่ได้ |
| Page | `app/(app)/scm/**/page.tsx` | เรียก `can(actor, …)` — ไม่ผ่านแสดง `<NoAccess />` และซ่อนปุ่มลงมือ |
| Query | `currentScope()` + `narrowScope()` | กรอง channel ในทุก query ที่แตะ demand ของลูกค้า |
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
