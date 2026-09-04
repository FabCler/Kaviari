# 13. Business Channel Structure & SO-PO Mapping

## 1. Business Channel (§2)

ระบบแบ่งงานขายเป็น **Business Channel** และ channel เป็น **ข้อมูล ไม่ใช่ enum**
การเพิ่ม channel ใหม่ในอนาคตทำได้ที่หน้า Master data → Business channels
โดย **ไม่ต้องแก้ Database Structure และไม่ต้องแก้โค้ด**

| Channel Code | Channel Name | ชื่อไทย | Default priority |
|---|---|---|---:|
| `FS` | Food Service | ฟู้ดเซอร์วิส | 10 |
| `RTL` | Retail | ค้าปลีก | 20 |
| `STR` | Store | ร้านค้า | 30 |
| `CK` | Central Kitchen | ครัวกลาง | 40 |

`defaultPriority` คือ **ลำดับที่ระบบใช้เสนอ** เมื่อสินค้าไม่พอและหลาย channel
ต้องการสินค้าเดียวกัน — เป็นข้อเสนอเท่านั้น ระบบไม่เคยตัดลูกค้าเอง (ดูข้อ 4)

### ทำไม channel ต้องเป็นแถวในตาราง

| ทางเลือก | ผลเมื่อเพิ่ม channel ใหม่ |
|---|---|
| enum ใน schema | ต้อง migrate + แก้ทุกที่ที่ switch case |
| คอลัมน์ boolean ต่อ channel | ต้องเพิ่มคอลัมน์ + แก้ทุก query |
| **แถวใน `business_channels`** ✓ | **insert 1 แถว — filter, permission, report เห็นทันที** |

โค้ดทุกจุดที่กรองตาม channel ใช้ `lib/osms/channels.ts` ซึ่งอ่านจากตาราง
ไม่มีที่ไหนใน codebase ที่ hard-code รหัส `FS`/`RTL`/`STR`/`CK` เป็นเงื่อนไข

## 2. โครงสร้างลูกค้า (§3)

```
business_channels
      ↓  (customers.channelId)
   customers
      ↓  (sales_orders.customerId)
  sales_orders  ── channelId (denormalised)
      ↓
sales_order_lines
      ↓
   products
```

ตัวอย่างจริงจาก sample data:

```
Food Service (FS)
 ├─ Mandarin Oriental Bangkok    SO-2026-0101, SO-2026-0104, SO-2026-0201
 ├─ Blue Elephant Restaurant     SO-2026-0102
 └─ Sirocco Sky Dining
Retail (RTL)
 ├─ Gourmet Market Paragon       SO-2026-0103, SO-2026-0202
 └─ Villa Market Thonglor
Store (STR)
 ├─ Flagship Store Bangkok        SO-2026-0105, SO-2026-0203
 └─ Flagship Store Phuket
Central Kitchen (CK)
 └─ Central Kitchen Bangna       SO-2026-0107, SO-2026-0204
```

**ทำไม `sales_orders.channelId` ถึง denormalise จากลูกค้า** — ถ้าลูกค้าย้าย
channel ในอนาคต ประวัติคำสั่งซื้อเดิมต้องยังอยู่ใน channel เดิม ไม่ใช่ย้ายตามไปด้วย
และทุกกระดานกรองได้โดยไม่ต้อง join

## 3. สิทธิ์ตาม Channel (§4.2, §39)

| ผู้ใช้ | เห็น channel ไหน |
|---|---|
| Sales — Food Service | เฉพาะ FS |
| Sales — Retail | เฉพาะ RTL |
| Sales — Store | เฉพาะ STR |
| Sales — Central Kitchen | เฉพาะ CK |
| **Sales Manager** | ทุก channel (รวมที่เพิ่มในอนาคต) |
| Purchasing | ทุก channel |
| Warehouse | ทุก channel |
| Management | ทุก channel |
| Admin | ทุก channel |

### วิธีการทำงาน

```ts
// lib/osms/channels.ts
channelScopeFor(actor) → { all: boolean, ids: string[], channels: [...] }
narrowScope(scope, requestedChannelId)  // ?channel= ใน URL
channelWhere(scope, requested)          // Prisma where fragment
```

**กติกาสำคัญ 2 ข้อ:**

1. ผู้ใช้ที่ยังไม่ได้รับ channel ใด ๆ ได้ `{ in: [] }` — **เห็นศูนย์รายการ ไม่ใช่เห็นทุกรายการ**
   ความผิดพลาดที่อันตรายที่สุดคือ scope ว่างถูกตีความว่า "ไม่ต้องกรอง"
2. ถ้าผู้ใช้ใส่ `?channel=<id>` ที่ตัวเองไม่มีสิทธิ์ → `narrowScope` ยุบเหลือ scope ว่าง
   **ไม่ใช่กลับไปเป็นมุมมองที่ไม่กรอง** (มีเทสต์ครอบเคสนี้ใน `tests/osms-channels.test.ts`)

Sales Manager ใช้ **flag `User.allChannels`** ไม่ใช่การติ๊กทุก channel เพราะ
channel ที่เพิ่มเดือนหน้าต้องครอบคลุมโดยไม่ต้องกลับมาแก้บัญชีทุกใบ

การกำหนดสิทธิ์ทำที่ **Settings → Users**: เลือกแผนก แล้วติ๊ก channel
(หรือกด "Manager · all")

---

## 4. SO ↔ PO Mapping (§6, §7)

### ไม่มีความสัมพันธ์ SO → PO โดยตรง

สเปคห้ามไว้ชัดเจน และระบบก็ไม่มีคอลัมน์นั้นจริง ๆ:

```
sales_order_lines
       ↓
  so_po_mapping        ← ความสัมพันธ์อยู่ที่นี่ ระดับบรรทัด
       ↓
purchase_order_lines
```

### ตาราง `so_po_mapping`

| Field | คำอธิบาย |
|---|---|
| `id` | Mapping ID |
| `soId` / `soLineId` | SO และบรรทัด SO |
| `poId` / `poLineId` | PO และบรรทัด PO |
| `prLineId` | บรรทัด PR (ถ้ามี) |
| `productId` | สินค้า |
| `quantity` | **จำนวนที่ PO บรรทัดนี้ครอบคลุม demand นี้** (หน่วยคลัง) |
| `unit` | หน่วย |
| `reason` | เหตุผลที่แบ่งแบบนี้ (เช่น supplier ส่งไม่พร้อมกัน) |
| `createdById` / `createdByName` / `createdAt` | ใครสร้าง เมื่อไร |

### กรณีที่รองรับ

**PO 1 ใบ → หลาย SO**

| SO | Channel | Product | SO Qty | PO | PO share |
|---|---|---|---:|---|---:|
| SO-2026-0201 | FS | Salmon | 1,000 | PO-2026-0005 | 1,000 |
| SO-2026-0202 | RTL | Salmon | 500 | PO-2026-0005 | 200 |

**SO 1 ใบ → หลาย PO**

| SO | Channel | Product | SO Qty | PO | PO share |
|---|---|---|---:|---|---:|
| SO-2026-0202 | RTL | Salmon | 500 | PO-2026-0005 | 200 |
| SO-2026-0202 | RTL | Salmon | 500 | PO-2026-0006 | 300 |

ทั้งสองกรณีอยู่ใน sample data จริง — เปิดดูได้ที่
**Purchase planning** และหน้า **Document trace**

### Purchase Planning (§8)

หน้า `02 Purchase planning` คำนวณจาก mapping:

```
Required Quantity  = baseQuantity ของบรรทัด demand
Already Ordered    = Σ so_po_mapping.quantity ของบรรทัดนั้น
Remaining Quantity = Required − Already Ordered
```

บรรทัดที่ `Remaining > 0` ยังขึ้นบนกระดานให้เปิด PO เพิ่ม — จึงแบ่ง SO เดียว
ไปหลาย PO ได้โดยธรรมชาติ ไม่ต้องมีปุ่ม "split" แยกต่างหาก

ตัวอย่างตามสเปค:
```
SO001 = 1,000 KG
PO001 = 600 KG   → Remaining 400 → ยังขึ้นบนกระดาน
PO002 = 400 KG   → Remaining 0   → หายจากกระดาน
Ordered Qty = 1,000 · Remaining = 0
```

---

## 5. Cross-Channel Shortage (§20, §45)

### เมื่อไรถึงเกิด

`lib/osms/shortage.ts → detectCrossChannelShortage()` สร้าง case เมื่อ **ทั้งสองข้อ**
เป็นจริง:

1. จำนวนที่ยืนยันแล้ว < demand รวมของบรรทัด PO นั้น
2. demand นั้นมาจาก **มากกว่า 1 channel**

ถ้าขาดแค่ channel เดียว → เป็น Sales review ปกติ (§14) ไม่ต้องขึ้นถึงผู้บริหาร

### สิ่งที่ระบบทำ และไม่ทำ

| ระบบทำ | ระบบไม่ทำ |
|---|---|
| แสดง demand แยกตาม channel | ❌ ตัดจำนวนลูกค้าเอง |
| เสนอการแบ่งตาม channel priority | ❌ บันทึกข้อเสนอลง SO |
| ล็อกทุกขั้นตอนถัดไปจนกว่าจะมีคนตัดสิน | ❌ ปล่อยผ่านเมื่อ timeout |
| บันทึกว่าใครตัดสิน เมื่อไร เพราะอะไร | ❌ ให้ Sales ของ channel เดียวตัดสินแทน channel อื่น |

**หน้าจอไม่กรอกตัวเลขให้ล่วงหน้า** — ข้อเสนออยู่หลังปุ่ม "Fill in the proposal"
เพราะฟอร์มที่เปิดมาพร้อมตัวเลขชวนให้กด Approve โดยไม่อ่าน

### ใครอนุมัติได้

`shortage.approve` — **Management** และ **Sales Manager** (sales ที่เห็นทุก channel)
เท่านั้น Sales ของ channel เดียวอนุมัติไม่ได้ เพราะเป็นการตัดสินแทน channel อื่น

### ตัวอย่างตามสเปค §45

```
FS        1,000
Retail      500
Store       300
CK          200
----------------
Total SO  2,000
Actual    1,700
Short       300
```

ข้อเสนอจาก channel priority (FS 10 → RTL 20 → STR 30 → CK 40):

```
FS     1,000   (เต็ม)
RTL      500   (เต็ม)
STR      200   (ถูกตัด 100)
CK         0   (ถูกตัดทั้งหมด)
```

ผู้บริหารแก้เป็นอะไรก็ได้ ตราบใดที่:

* ผลรวม = 1,700 พอดี
* ไม่มีใครได้เกินที่สั่ง

ผลลัพธ์ตามที่สเปคยกตัวอย่าง (FS 900 · RTL 400 · STR 250 · CK 150 = 1,700)
ก็ผ่านเกณฑ์นี้

### หลังอนุมัติ

1. เขียน `approvedQuantity` ลงทุกบรรทัดของ case
2. สร้าง/อัปเดต `so_po_reconciliation` เป็น `completed` ด้วยตัวเลขที่อนุมัติ
3. อัปเดต `sales_order_lines.quantity` และ `confirmedQuantity`
   (`originalQuantity` ไม่ถูกแตะ)
4. เขียน audit trail ทุกบรรทัดที่จำนวนเปลี่ยน
5. ปิด exception และแจ้ง Sales ให้ allocate
