# ระบบบริหารการสั่งซื้อ – รับสินค้า – ตรวจสอบ Invoice – จัดสรรสินค้า – ส่งสินค้า

Supply-chain module for Kaviari Cellar — design documents and the map from
each design deliverable to the code that implements it.

> **ภาษา** — เอกสารชุดนี้เขียนแบบสองภาษา: หัวข้อและชื่อทางเทคนิคเป็น
> ภาษาอังกฤษ (ตรงกับชื่อไฟล์/ตาราง/ฟังก์ชันในโค้ดจริง) ส่วนคำอธิบาย
> เชิงธุรกิจเป็นภาษาไทย

## เอกสารออกแบบ (Design deliverables)

| # | เอกสาร | ไฟล์ |
|---|---|---|
| 1 | System Architecture | [01-architecture.md](01-architecture.md) |
| 2 | Process Flow Diagram | [01-architecture.md](01-architecture.md#2-process-flow-diagram) |
| 3 | Database ER Diagram | [02-data-model.md](02-data-model.md#1-er-diagram) |
| 4 | Data Dictionary | [02-data-model.md](02-data-model.md#2-data-dictionary) |
| 5 | User Role & Permission Matrix | [03-roles-permissions.md](03-roles-permissions.md) |
| 6 | Workflow Status Diagram | [04-workflow-status.md](04-workflow-status.md) |
| 7 | UI Wireframe | [05-ui-wireframes.md](05-ui-wireframes.md) |
| 8 | Validation Rules | [06-rules.md](06-rules.md#1-validation-rules) |
| 9 | Business Rules | [06-rules.md](06-rules.md#2-business-rules) |
| 10 | Exception Handling | [07-exceptions.md](07-exceptions.md) |
| 11 | Dashboard Design | [08-dashboard.md](08-dashboard.md) |
| 12 | Sample Data | [09-sample-data.md](09-sample-data.md) |
| 13 | ตัวอย่างหน้าจอแต่ละแผนก | [05-ui-wireframes.md](05-ui-wireframes.md#6-ตัวอย่างหน้าจอแต่ละแผนก) |
| 14 | End-to-End Test Case | [10-test-cases.md](10-test-cases.md) |
| 15 | UAT Checklist | [11-uat-checklist.md](11-uat-checklist.md) |
| 16 | BPMN | [01-architecture.md](01-architecture.md#bpmn--กระบวนการหลักแบบมี-lane-และ-gateway) |
| 17 | Business Channel Structure | [13-business-channels.md](13-business-channels.md) |
| 18 | SO-PO Mapping | [13-business-channels.md](13-business-channels.md#4-so--po-mapping-§6-§7) |
| 19 | Tolerance Rules | [06-rules.md](06-rules.md#br-08--tolerance-ตาม-product-type--supplier--channel-§28) |
| 20 | API Structure | [14-api-structure.md](14-api-structure.md) |
| 21 | Notification Logic | [07-exceptions.md](07-exceptions.md#6-การแจ้งเตือนที่คู่กัน-§40) |
| — | ERP / SAP Business One extension | [12-erp-integration.md](12-erp-integration.md) |

## โครงสร้างโค้ด (Where the code lives)

```
lib/scm/
  domain.ts          vocabulary — departments, statuses, reasons, exception types
  channels.ts        business-channel scoping (§2, §39) — channels are DATA
  status.ts          the 22-state engine + resolveStatus() (§42)
  permissions.ts     the role & permission matrix, incl. the sales manager
  units.ts           unit conversion (every comparison in the stock unit)
  tolerance.ts       tolerance by supplier / channel / product type (§28)
  sla.ts             due date, remaining days, priority, on track/overdue (§27)
  reconcile.ts       PO↔Invoice, Invoice↔SO and PO↔SO comparison math
  shortage.ts        cross-channel shortage: propose, never decide (§20, §45)
  allocation.ts      allocation totals, "unallocated = 0", per-piece weighing
  warehouse-stock.ts leftover with its origin chain + movement history (§24)
  gate.ts            the six receiving checks (§22)
  workflow.ts        orchestration: reconciliations, statuses, gate a PO
  reports.ts         supplier (§33) and channel (§34) performance
  audit.ts           the audit trail
  exceptions.ts      raise / resolve exceptions
  notify.ts          workflow notifications, scoped by channel
  numbering.ts       PO-… RCV-… ALC-… SHP-… EXC-… SHT-… STK-…
  queries.ts         read models for the boards and the dashboards
  trace.ts           document relationship trace (§37)
  settings.ts        fallback tolerances, editable by an admin
  guard.ts           server-side permission + channel guards
  import/            column mapping, row reader, validators, commit, invoice OCR

app/api/scm/       route handlers (import, invoices, purchase-orders,
                   reconcile, allocations, receiving, shipments, master,
                   exceptions, notifications, settings, exports)
app/(app)/scm/     the screens
components/scm/    the module's UI components
prisma/seed-scm.ts sample data (four scenarios)
tests/scm-*.test.ts unit tests for the rules above
```

## หลักการออกแบบ 7 ข้อ (Design principles)

1. **จำนวนที่ยืนยันล่าสุดคือความจริง (§14).** ทุกขั้นตอนถัดไปใช้
   `correctedQuantity` ที่ Purchasing ยืนยัน ไม่ใช่จำนวนที่สั่งไปแต่แรก —
   `confirmedQuantity()` ใน `lib/scm/reconcile.ts` เป็นที่เดียวที่ตัดสินใจเรื่องนี้
2. **ห้ามข้ามขั้นตอน (§21).** ประตู 6 ด่าน (`lib/scm/gate.ts`) เป็นฟังก์ชัน
   บริสุทธิ์ที่ทั้งหน้าจอ, API และ Dashboard ใช้ร่วมกัน ซ่อนปุ่มอย่างเดียวไม่ใช่สิทธิ์ —
   route handler ตรวจซ้ำเสมอ
3. **ไม่ลบข้อมูลเดิม (§12).** การแก้ไขทุกครั้งเขียน user / field / old / new /
   reason ลง `audit_logs`; master data ปิดการใช้งาน (`active=false`) แทนการลบ
4. **เปรียบเทียบในหน่วยเดียวกันเสมอ (§11).** ทุกเอกสารเก็บ `baseQuantity`
   ในหน่วยคลังของสินค้า การนำเข้าที่แปลงหน่วยไม่ได้จะถูกปฏิเสธ
5. **ความต่างต้องมีเหตุผลและเจ้าของ (§26, §27).** ทุก exception มี reason +
   responsible department + owner + action + due date + priority + status
6. **Business Channel เป็นข้อมูล ไม่ใช่โครงสร้าง (§2).** เพิ่ม channel ใหม่ =
   insert 1 แถว ไม่ต้องแก้ schema ไม่ต้องแก้โค้ด และ scope ว่างแปลว่า
   "ไม่เห็นอะไรเลย" ไม่ใช่ "เห็นทุกอย่าง"
7. **ระบบไม่ตัดลูกค้าเอง (§20).** เมื่อของไม่พอและมีหลาย channel แข่งกัน
   ระบบเสนอการแบ่งแล้ว *หยุด* จนกว่าผู้บริหารหรือ Sales Manager จะอนุมัติ

## การเริ่มใช้งาน

```bash
npm install
cp .env.example .env
npm run setup      # prisma db push + seed (รวม sample data ของโมดูลนี้)
npm run dev
```

เปิด `/register` สร้างบัญชี → บัญชีที่ตรงกับ `OWNER_EMAIL` เป็น **owner = admin**
จากนั้นกำหนดแผนกให้ผู้ใช้อื่นที่ **Settings → Users** แล้วเข้าที่เมนู
**Supply chain → Workflow**
