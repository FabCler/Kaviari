# 1. System Architecture & Process Flow

## 1. System architecture

โมดูลนี้ต่อยอดบนแอป Kaviari Cellar เดิม (Next.js App Router + Prisma) โดยใช้
ฐานข้อมูล, ระบบล็อกอิน, ธีมและ product master ร่วมกัน ไม่ได้แยกเป็นอีกระบบหนึ่ง

```mermaid
flowchart TB
  subgraph client["Browser — Left sidebar navigation"]
    UI["Server Components (boards, detail pages)<br/>Client Components (editors, dialogs)"]
  end

  subgraph server["Next.js server (App Router)"]
    PAGES["app/(app)/scm/** — pages<br/>read through lib/scm/queries.ts"]
    API["app/api/scm/** — route handlers<br/>zod validation + permission guard"]
    DOMAIN["lib/scm/** — domain layer<br/>status · permissions · units · reconcile<br/>allocation · gate · workflow · audit"]
  end

  subgraph data["Data"]
    DB[("SQLite / PostgreSQL<br/>via Prisma")]
    FILES["Uploaded files<br/>(xlsx · csv · pdf)"]
  end

  subgraph ext["External"]
    AI["Anthropic API<br/>invoice extraction (optional)"]
    ERP["SAP Business One / ERP<br/>(future — see 12-erp-integration.md)"]
  end

  UI -->|"fetch()"| API
  UI --> PAGES
  PAGES --> DOMAIN
  API --> DOMAIN
  DOMAIN --> DB
  API --> FILES
  FILES --> AI
  AI --> API
  DOMAIN -.->|"documentNumber / code<br/>as the integration key"| ERP
```

### ชั้นของระบบ (Layers)

| Layer | หน้าที่ | ไฟล์ |
|---|---|---|
| **Presentation** | หน้าจอ 16 หน้า, sidebar แยกตามแผนก | `app/(app)/scm/**`, `components/scm/**` |
| **API** | รับคำสั่งเปลี่ยนสถานะ ตรวจสิทธิ์และ validate ด้วย zod | `app/api/scm/**` |
| **Domain** | กฎธุรกิจทั้งหมด เป็นฟังก์ชันบริสุทธิ์ที่ทดสอบได้ | `lib/scm/*.ts` |
| **Persistence** | Prisma models 23 ตาราง | `prisma/schema.prisma` |
| **Integration** | อ่านไฟล์ Excel/CSV/PDF, เรียก AI สำหรับ Invoice | `lib/scm/import/**`, `lib/import/parse.ts` |

### ทำไมกฎธุรกิจต้องอยู่ในชั้น Domain

หน้าจอ, API และ Dashboard ต้องตอบคำถามเดียวกันให้ตรงกันเสมอ เช่น
"PO ใบนี้พร้อมรับของหรือยัง" — ถ้าแต่ละที่คำนวณเอง ระบบจะขัดแย้งกันเอง
`evaluateGate()` จึงเป็นฟังก์ชันเดียวที่ทั้งสามที่เรียกใช้ และ
`app/api/scm/receiving/route.ts` เรียกซ้ำก่อนบันทึกเสมอ แม้หน้าจอจะซ่อนปุ่มไว้แล้ว

### Security

- Session: HMAC-signed cookie (ของเดิม) → `getCurrentUser()`
- Authorization: `lib/scm/permissions.ts` — matrix ตามแผนก
  ทุก route handler เรียก `requirePermission()` ก่อนทำงาน
- Audit: `lib/scm/audit.ts` เขียนทุกการเปลี่ยนแปลงพร้อม user/reason
- Input: zod schema ทุก endpoint; ไฟล์อัปโหลดจำกัดขนาดและนามสกุล

---

## 2. Process Flow Diagram

### ภาพรวม (§18 Main workflow)

```mermaid
flowchart TD
  A["Customer order"] --> B["Sales creates SO / PR<br/>(import or manual)"]
  B --> C{"Purchasing review<br/>Order management board"}
  C --> D["Plan supplier & quantity<br/>(MOQ / pack size → reason required)"]
  D --> E["PO issued"]
  E --> F["Supplier ships"]
  F --> G["Upload supplier invoice (PDF)<br/>extract → verify"]
  G --> H{"PO vs Invoice<br/>reconciliation"}
  H -->|"match"| I["Auto-approved"]
  H -->|"quantity or price differs"| J["Purchasing confirms<br/>corrected quantity + reason"]
  I --> K
  J --> K["Corrected quantity is now<br/>the source of truth (§14)"]
  K --> L{"Invoice/PO vs SO"}
  L -->|"match"| M["Auto-completed"]
  L -->|"short"| N["Sales: which customer is cut,<br/>by how much, accepted?"]
  L -->|"over"| O["Sales: give to a customer<br/>or move to warehouse stock"]
  M --> P
  N --> P
  O --> P["Allocation<br/>customers + stock = actual"]
  P -->|"unallocated = 0"| Q{"Receiving gate<br/>6 checks"}
  P -->|"unallocated > 0"| P
  Q -->|"pass"| R["READY TO RECEIVE"]
  Q -->|"fail"| S["BLOCKED<br/>+ the failing step"]
  R --> T["Warehouse receives<br/>records lot / location"]
  T --> U{"Weight-controlled<br/>product?"}
  U -->|"yes"| V["Weigh each piece<br/>assign each item to a customer"]
  U -->|"no"| W
  V --> W["Pick & pack"]
  W --> X["Customer shipment"]
  X --> Y["COMPLETED"]
  S -.->|"resolve the exception"| Q
```

### ใครทำอะไร (Swimlane)

```mermaid
flowchart LR
  subgraph sales["Sales"]
    S1["Import SO"]
    S2["Review quantity difference"]
    S3["Contact customer / adjust SO"]
    S4["Allocate to customers & stock"]
  end
  subgraph purchasing["Purchasing"]
    P1["Import PR/SO demand"]
    P2["Plan PO (supplier, qty, MOQ reason)"]
    P3["Upload & verify invoice"]
    P4["Confirm corrected quantity/price"]
  end
  subgraph warehouse["Warehouse"]
    W1["See READY TO RECEIVE only"]
    W2["Record actual quantity, lot, location"]
    W3["Weigh individual items"]
    W4["Pick, pack, ship"]
  end
  subgraph mgmt["Management / Admin"]
    M1["Dashboard & variance"]
    M2["Master data & tolerances"]
    M3["Users & permissions"]
    M4["Audit log"]
  end

  S1 --> P1 --> P2 --> P3 --> P4 --> S2 --> S3 --> S4 --> W1 --> W2 --> W3 --> W4
  M1 -.-> P4
  M1 -.-> S2
  M1 -.-> W1
```

### ลำดับเวลาแบบละเอียด (Sequence — invoice ถึง receiving)

```mermaid
sequenceDiagram
  participant PU as Purchasing
  participant API as /api/scm/*
  participant W as lib/scm/workflow.ts
  participant DB as Database
  participant SA as Sales
  participant WH as Warehouse

  PU->>API: POST /invoices (PDF)
  API->>API: extractInvoice() — read the document
  API->>DB: invoice = pending_verification + lines
  PU->>API: PATCH /invoices/:id {action: verify}
  API->>W: runPoInvoiceReconciliation(poId)
  W->>DB: one recon row per PO line
  Note over W,DB: match → approved automatically<br/>difference → pending_review + exception + notification
  PU->>API: POST /reconcile {po_invoice, approve, reason}
  API->>DB: poLine.correctedQuantity = confirmed
  API->>W: runSoReconciliation(poId)
  W->>DB: so_po_reconciliation rows
  Note over W,DB: difference → pending_sales_review (blocks receiving)
  SA->>API: POST /reconcile {so, decision, reason}
  SA->>API: POST /allocations {complete: true}
  API->>API: validateAllocation() — unallocated must be 0
  WH->>API: POST /receiving
  API->>W: gateForPo() — the six checks
  alt every check passes
    API->>DB: receiving + items, PO closed
  else any check fails
    API-->>WH: 409 BLOCKED + which check failed
  end
```
