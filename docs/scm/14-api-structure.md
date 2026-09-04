# 14. API Structure

ทุก endpoint อยู่ใต้ `/api/scm/**` เป็น Next.js Route Handler
รูปแบบเดียวกันทั้งหมด:

1. `requirePermission("<permission>")` — 401 ถ้าไม่ได้ล็อกอิน, 403 ถ้าแผนกไม่มีสิทธิ์
2. `zod` validate body — 400 พร้อมข้อความที่บอกว่าผิดตรงไหน
3. ตรวจกฎธุรกิจ — 409 (สถานะไม่ถูกต้อง) หรือ 422 (ข้อมูลไม่ผ่านกฎ)
4. เขียนข้อมูล + audit trail + exception + notification
5. คืน JSON ที่บอกผลจริง ไม่ใช่แค่ `{ok:true}`

| รหัส | ความหมายในระบบนี้ |
|---|---|
| 200 / 201 | สำเร็จ |
| 400 | body ผิดรูปแบบ |
| 401 | ยังไม่ได้ล็อกอิน |
| 403 | แผนก/channel ไม่มีสิทธิ์ |
| 404 | ไม่พบเอกสาร |
| 409 | ขัดกับสถานะปัจจุบัน (เช่น ยังไม่ผ่าน gate, อนุมัติไปแล้ว) |
| 410 | ข้อมูลชั่วคราวหมดอายุ (batch นำเข้าหาย) |
| 413 | ไฟล์ใหญ่เกิน |
| 422 | ผ่าน schema แต่ผิดกฎธุรกิจ (เช่น ไม่ใส่เหตุผล) |

---

## 1. Import (§5)

### `POST /api/scm/import`
**สองขั้นตอนใน endpoint เดียว**

**ขั้นที่ 1 — ตรวจไฟล์** (`multipart/form-data`)

| Field | ค่า |
|---|---|
| `kind` | `demand` \| `po` \| `so` |
| `file` | .xlsx / .xls / .csv |

Permission: `import.demand` / `import.po` / `import.so`

```jsonc
// 200
{
  "batchId": "cmt…",
  "kind": "demand",
  "fileName": "demand.xlsx",
  "okCount": 3, "errorCount": 4, "warningCount": 3,
  "rows": [{ "rowNumber": 2, "raw": {...}, "issues": [...], "data": {...} }],
  "unmatchedHeaders": [], "notices": [], "truncated": false
}
```

**ขั้นที่ 2 — ยืนยัน** (`application/json`)

```jsonc
// → { "batchId": "cmt…" }
// 200
{ "imported": 3, "skipped": 4, "createdDocuments": ["SO-…"], "warnings": [...] }
// 409 ถ้า batch นี้ commit ไปแล้ว
```

### `POST /api/scm/invoices` — อัปโหลด Invoice (§5.3)
`multipart`: `file` (PDF/xlsx), `poId?` · Permission `import.invoice`

```jsonc
// 201
{ "id": "…", "invoiceNumber": "INV-…", "status": "pending_verification",
  "poId": "…", "lineCount": 4, "mode": "ai", "notices": [...] }
// 409 ถ้า invoice ซ้ำ — คืน invoiceId ของใบเดิมมาให้ด้วย
```

### `PATCH /api/scm/invoices/[id]` — ตรวจ/แก้/ยืนยัน
Permission `purchasing.reconcilePoInvoice`

```jsonc
{
  "action": "save" | "verify" | "reject",
  "invoiceNumber": "…", "poId": "…", "invoiceDate": "2026-10-02",
  "rejectReason": "…",
  "lines": [{ "id": "…", "productId": "…", "quantity": 30, "unit": "Tin",
              "unitPrice": 107.9, "deliveryDate": "2026-10-06" }]
}
```
`verify` ปฏิเสธด้วย 422 ถ้ายังมีบรรทัดไม่มีสินค้า หรือยังไม่ผูก PO
สำเร็จแล้วรัน reconciliation ทันทีและคืน `{ reconciliation: { created, needsReview } }`

---

## 2. Purchasing (§8, §11, §12)

### `POST /api/scm/purchase-orders` — เปิด PO
Permission `purchasing.createPo`

```jsonc
{
  "supplierId": "…", "currency": "EUR", "notes": "…",
  "lines": [{
    "productId": "…",
    "prLineIds": ["…"], "soLineIds": ["…"],
    "soQuantities": { "<soLineId>": 200 },   // §8 แบ่ง SO เดียวไปหลาย PO
    "mappingReason": "Supplier split the shipment",
    "quantity": 3, "unit": "BOX", "unitPrice": 103.75,
    "deliveryDate": "2026-10-15", "moq": 2,
    "adjustmentReason": "MOQ",               // บังคับเมื่อสั่งเกิน demand
    "adjustmentNote": "…"
  }]
}
// 201 { "id": "…", "poNumber": "PO-2026-0007", "lineCount": 2 }
// 422 ถ้าสั่งเกิน demand โดยไม่ใส่ adjustmentReason
```

### `PATCH /api/scm/purchase-orders` — เปลี่ยนสถานะ/หมายเหตุ
Permission `purchasing.editPo` · `{ id, status?, notes?, reason? }`

### `POST /api/scm/reconcile` — จุดตัดสินใจของคน
Discriminated union บน `target`

**`po_invoice`** (§12) · Permission `purchasing.approveVariance`
```jsonc
{
  "target": "po_invoice", "id": "<reconId>",
  "action": "approve" | "reject" | "hold",
  "correctedQuantity": 30,
  "quantityReason": "SUPPLIER_SHORT_SHIPPED",  // บังคับเมื่อจำนวนต่าง
  "priceReason": "PRICE_LIST_UPDATED",         // บังคับเมื่อราคาต่าง
  "remark": "…"
}
// 200 { "status": "approved", "correctedQuantity": 30, "salesReviewsCreated": 1 }
// 422 { "error": "…", "field": "quantityReason" }
```

**`so`** (§14, §15) · Permission `sales.reviewDifference`
```jsonc
{
  "target": "so", "id": "<soReconId>",
  "decision": "keep_so" | "reduce_so" | "increase_customer"
            | "warehouse_stock" | "split",
  "newSoQuantity": 30, "customerAccepted": true,
  "reason": "…"                                 // บังคับเสมอ
}
// 200 { "status": "completed", "newSoQuantity": 30, "remainingReviews": 0 }
```

---

## 3. Cross-channel shortage (§20)

### `POST /api/scm/shortage`
Permission `shortage.approve` — **Management หรือ Sales Manager เท่านั้น**

```jsonc
{
  "caseId": "…",
  "action": "approve" | "reject",
  "decisionNote": "…",
  "lines": [{ "id": "…", "approvedQuantity": 1000, "priority": 10, "reason": "…" }]
}
// 200 { "status": "applied", "approvedTotal": 1150 }
// 422 ถ้าผลรวม ≠ จำนวนที่ได้จริง หรือให้ใครเกินที่สั่ง
// 409 ถ้า case นี้ตัดสินไปแล้ว
```

---

## 4. Sales allocation (§16, §17)

### `POST /api/scm/allocations`
Permission `sales.allocate`

```jsonc
{
  "poLineId": "…",
  "complete": true,
  "actualQuantity": 20,        // ทับค่าที่คำนวณได้ (ใช้หลังชั่งน้ำหนัก)
  "lines": [
    { "target": "customer", "customerId": "…", "soLineId": "…", "quantity": 12 },
    { "target": "warehouse", "quantity": 6, "storageLocation": "FRZ-01",
      "reason": "MOQ leftover", "responsibleDept": "sales" }
  ]
}
// 200 { "allocationNumber": "ALC-2026-0002", "status": "completed",
//       "totals": { "allocatedQuantity": 20, "warehouseQuantity": 0,
//                   "unallocatedQuantity": 0, "balanced": true } }
// 409 ถ้า reconciliation ยังไม่ approved / มี sales review ค้าง / มี shortage case ค้าง
// 422 ถ้ายัง unallocated ≠ 0 หรือ warehouse line ขาด location/reason/dept
```

---

## 5. Warehouse (§21–§25)

### `POST /api/scm/receiving`
Permission `warehouse.receive` — **รันด่านทั้ง 6 ใหม่ก่อนบันทึกเสมอ**

```jsonc
{
  "poId": "…", "receivedDate": "2026-10-02", "notes": "…", "complete": true,
  "lines": [{
    "poLineId": "…", "actualQuantity": 20,
    "lotNumber": "CRAB-L1", "expiryDate": "2026-11-15",
    "storageLocation": "FRZ-01", "remark": "…",
    "items": [{ "itemNo": "CRAB-01", "weight": 2.1,
                "allocationLineId": "…", "condition": "good" }]
  }]
}
// 201 { "receiptNumber": "RCV-2026-0003", "status": "received", "fullyReceived": false }
// 409 { "error": "BLOCKED — <ด่านที่ไม่ผ่าน>", "checks": [ …ทั้ง 6 ด่าน… ] }
// 422 ถ้าไม่ชั่ง / จ่ายชิ้นไม่ครบ / itemNo ซ้ำ / ลูกค้าไม่อยู่ใน allocation
//     / เกินจำนวนที่ยืนยัน / ขาด lot หรือ expiry ที่ product master บังคับ
```

### `POST /api/scm/warehouse-stock` — ย้าย stock (§24)
Permission `warehouse.stock`

```jsonc
{ "stockId": "…", "type": "out" | "adjust" | "reserve" | "release" | "write_off",
  "quantity": 20, "reason": "…" }        // reason บังคับเสมอ
// 200 { "balance": 80 }
// 422 ถ้าย้ายเกินยอดคงเหลือ
```

### `POST /api/scm/shipments` (§25)
Permission `warehouse.ship`

```jsonc
{ "customerId": "…", "shipDate": "2026-10-02",
  "deliveryLocation": "…", "allocationLineIds": ["…"] }
// 201 { "shipmentNumber": "SHP-2026-0001", "status": "shipped" }
// 422 ถ้าปนหลายลูกค้า · 409 ถ้า allocation ยังไม่ completed หรือส่งไปแล้ว
```

---

## 6. Master data (§35) & controls

### `POST /api/scm/master/[entity]`
Permission `master.manage` · entity: `channels` \| `suppliers` \| `customers` \| `units` \| `conversions` \| `products` \| `tolerances`

```jsonc
// channels
{ "code": "WHS", "name": "Wholesale", "sortOrder": 5, "defaultPriority": 50 }
// tolerances (§28)
{ "scope": "supplier" | "channel" | "product_type" | "global",
  "supplierId": "…", "channelId": "…", "productType": "Caviar",
  "qtyTolerancePct": 2, "priceTolerancePct": 0, "weightTolerancePct": 5 }
```

### `DELETE /api/scm/master/[entity]?id=…`
ปิดการใช้งาน (`active=false`) ไม่ลบจริง ยกเว้น `conversions` ที่ลบได้

### `POST` / `PATCH /api/scm/exceptions` (§26)
Permission `exceptions.manage`
```jsonc
{ "id": "…", "status": "in_progress" | "resolved", "resolution": "…",
  "responsibleDept": "sales", "dueDate": "2026-10-05" }
```

### `PATCH /api/scm/settings`
Permission `master.manage` — ค่า fallback เมื่อไม่มี tolerance rule ที่ตรงกว่า

### `POST /api/scm/notifications`
`{ "ids": ["…"] }` — ทำเครื่องหมายว่าอ่านแล้ว

### `GET /api/scm/exports/[report]`
`supplier-summary` \| `po-vs-so` \| `audit` — คืนไฟล์ .xlsx
รองรับ query filter เดียวกับหน้าจอ

---

## 7. Users & channel permission (§39)

### `PATCH /api/users/[id]` — owner เท่านั้น

```jsonc
{ "action": "set_department", "department": "sales" }
{ "action": "set_channels", "channelIds": ["…"], "allChannels": false }
{ "action": "approve" | "reject" }
```

### `GET /api/users`
คืนผู้ใช้พร้อม `department`, `allChannels`, `channelIds` และรายการ channel ทั้งหมด

---

## 8. รูปแบบที่ใช้ซ้ำทุก endpoint

```ts
// 1) สิทธิ์ก่อนเสมอ — ก่อนแตะฐานข้อมูล
const actor = await requirePermission("warehouse.receive");
if (isResponse(actor)) return actor;

// 2) validate ด้วย zod
const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
if (!parsed.success) return Response.json({ error: … }, { status: 400 });

// 3) กฎธุรกิจจากชั้น domain — ฟังก์ชันเดียวกับที่หน้าจอใช้
const gate = await gateForPo(po.id);
if (!gate?.ready) {
  return Response.json({ error: `BLOCKED — ${gate.blockedReason}`,
                         checks: gate.checks }, { status: 409 });
}

// 4) เขียน + audit + exception + notification
await recordAudit(context, rows);
```

**ข้อความ error ทุกอันบอกว่าต้องทำอะไรต่อ** ไม่ใช่แค่บอกว่าผิด —
`"BLOCKED — SO review completed: Cross-channel shortage SHT-2026-0001 is
waiting for a management decision."` บอกทั้งสาเหตุ เอกสาร และคนที่ต้องลงมือ
