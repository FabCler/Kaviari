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
| — | ERP / SAP Business One extension | [12-erp-integration.md](12-erp-integration.md) |

## โครงสร้างโค้ด (Where the code lives)

```
lib/scm/
  domain.ts        vocabulary — departments, statuses, reasons, exception types
  status.ts        the 17 central workflow states + resolveStatus()
  permissions.ts   the role & permission matrix
  units.ts         unit conversion (every comparison happens in the stock unit)
  reconcile.ts     PO↔Invoice, Invoice↔SO and PO↔SO comparison math
  allocation.ts    allocation totals, the "unallocated = 0" invariant, weighing
  gate.ts          the six receiving checks (§7.1)
  workflow.ts      orchestration: run reconciliations, sync statuses, gate a PO
  audit.ts         the audit trail
  exceptions.ts    raise / resolve exceptions
  notify.ts        workflow notifications
  numbering.ts     PO-2026-0001, RCV-…, ALC-…, SHP-…, EXC-…
  queries.ts       read models for the boards and the dashboard
  trace.ts         document relationship trace (§13)
  settings.ts      tolerances, editable by an admin
  guard.ts         server-side permission guards
  import/          column mapping, row reader, validators, commit, invoice OCR

app/api/scm/       route handlers (import, invoices, purchase-orders,
                   reconcile, allocations, receiving, shipments, master,
                   exceptions, notifications, settings, exports)
app/(app)/scm/     the screens
components/scm/    the module's UI components
prisma/seed-scm.ts sample data (four scenarios)
tests/scm-*.test.ts unit tests for the rules above
```

## หลักการออกแบบ 5 ข้อ (Design principles)

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
5. **ความต่างต้องมีเหตุผลและเจ้าของ (§15).** ทุก exception มี reason +
   responsible department + action + due date + status

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
