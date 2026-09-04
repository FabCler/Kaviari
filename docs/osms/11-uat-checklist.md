# 11. UAT Checklist

ใช้ตรวจรับก่อนขึ้นใช้งานจริง ทำเครื่องหมาย ✅ / ❌ พร้อมชื่อผู้ทดสอบและวันที่

## A. การติดตั้งและข้อมูลตั้งต้น

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | `npm run setup` สำเร็จ ไม่มี error | |
| ☐ | สร้างบัญชีที่ `/register` และเข้าสู่ระบบได้ | |
| ☐ | บัญชี `OWNER_EMAIL` ได้สิทธิ์ owner/admin | |
| ☐ | เมนู "Supply chain" ปรากฏใน sidebar | |
| ☐ | Master data มี Supplier 3, Customer 4, Unit 9 รายการ | |
| ☐ | Product master แสดงชื่อไทย, หน่วยซื้อ, conversion, MOQ | |

## A2. Business Channel (§2, §3, §39)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | Master data → Business channels แสดง FS, RTL, STR, CK | |
| ☐ | เพิ่ม channel ใหม่ได้ และปรากฏใน filter ทุกหน้าทันที **โดยไม่ต้อง deploy** | |
| ☐ | ลูกค้าทุกรายผูกกับ channel ได้ | |
| ☐ | SO แสดง channel ของลูกค้า | |
| ☐ | เปลี่ยน channel ของลูกค้าแล้ว SO เก่ายังอยู่ channel เดิม | |
| ☐ | Admin กำหนด channel ให้ Sales ได้ที่ Settings → Users | |
| ☐ | Sales เห็นเฉพาะ channel ที่ได้รับมอบหมาย | |
| ☐ | Sales ใส่ `?channel=` ของ channel อื่นใน URL แล้วไม่เห็นอะไร | |
| ☐ | Sales Manager (Manager · all) เห็นทุก channel | |
| ☐ | Purchasing / Warehouse / Management เห็นทุก channel เสมอ | |
| ☐ | ผู้ใช้ sales ที่ยังไม่มี channel ไม่เห็นรายการใด ๆ | |
| ☐ | ทุกกระดานมี filter ตาม channel | |
| ☐ | Dashboard แสดง KPI แยกตาม channel | |
| ☐ | การเปลี่ยน channel permission ถูกบันทึกลง audit | |

## A3. Cross-Channel Shortage (§20, §45)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | ระบบสร้าง case อัตโนมัติเมื่อของขาดและ demand ข้าม channel | |
| ☐ | ของขาดใน channel เดียวไม่สร้าง case (เป็น Sales review ปกติ) | |
| ☐ | หน้า case แสดง demand แยกตาม channel พร้อม priority | |
| ☐ | **ช่อง Approved ว่างเปล่าตอนเปิดหน้า — ระบบไม่กรอกให้** | |
| ☐ | ปุ่ม "Fill in the proposal" เติมข้อเสนอตาม channel priority | |
| ☐ | แก้ตัวเลขเองได้ทุกบรรทัด | |
| ☐ | **Approve ไม่ได้จนกว่าผลรวมจะเท่ากับจำนวนที่ได้จริงพอดี** | |
| ☐ | ให้ลูกค้าเกินที่สั่งไม่ได้ | |
| ☐ | Sales ของ channel เดียวอนุมัติไม่ได้ (403) | |
| ☐ | Management อนุมัติได้ | |
| ☐ | Sales Manager อนุมัติได้ | |
| ☐ | **Allocation ถูกบล็อกจนกว่าจะอนุมัติ** | |
| ☐ | ด่านที่ 4 ของ receiving ไม่ผ่านระหว่างที่ case ค้าง | |
| ☐ | หลังอนุมัติ SO quantity เปลี่ยนตามที่อนุมัติ | |
| ☐ | `originalQuantity` เดิมยังอยู่ | |
| ☐ | audit บันทึกผู้อนุมัติ เวลา และเหตุผล | |
| ☐ | Reject ได้พร้อมเหตุผล | |

## B. Master data (§11, §35)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | เพิ่ม Supplier ใหม่ได้ และปรากฏในรายการทันที | |
| ☐ | ปิด Supplier (active = off) แล้วไม่ขึ้นในตัวเลือกตอนสร้าง PO | |
| ☐ | เพิ่ม Customer ใหม่ได้ | |
| ☐ | แก้ชื่อไทยของสินค้าแล้วแสดงบนกระดาน Order management | |
| ☐ | ตั้ง purchase unit + conversion แล้วการนำเข้าแปลงหน่วยถูกต้อง | |
| ☐ | ตั้ง MOQ แล้วจำนวนตั้งต้นตอนสร้าง PO ถูกยกขึ้นตาม MOQ | |
| ☐ | เปิด "Weighed" ให้สินค้าแล้วหน้ารับของขึ้นส่วนชั่งน้ำหนัก | |
| ☐ | เพิ่ม unit conversion ใหม่ได้ และมีผลกับการนำเข้า | |
| ☐ | เปลี่ยน tolerance global เป็น 5% แล้วความต่าง 4% ถูก auto-approve | |
| ☐ | เพิ่ม tolerance rule ตาม supplier ได้ | |
| ☐ | เพิ่ม tolerance rule ตาม business channel ได้ | |
| ☐ | เพิ่ม tolerance rule ตาม product type ได้ | |
| ☐ | กฎ supplier ชนะกฎ channel ชนะกฎ product type ชนะ global | |
| ☐ | ตั้ง Lot required / Expiry required ที่ product master แล้วรับของบังคับกรอก | |

## C. Import Files (§1)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | อัปโหลดไฟล์ demand ที่มี header ภาษาไทยได้ | |
| ☐ | อัปโหลดไฟล์ที่มี header ภาษาอังกฤษได้ | |
| ☐ | ไฟล์ที่ขาดคอลัมน์บังคับ ถูกปฏิเสธพร้อมบอกชื่อคอลัมน์ | |
| ☐ | ตรวจพบ Duplicate PO / PR / SO | |
| ☐ | ตรวจพบ Product Code ไม่มีใน Master | |
| ☐ | ตรวจพบหน่วยไม่ตรงกับ Master | |
| ☐ | ตรวจพบ Quantity เป็น 0 หรือติดลบ | |
| ☐ | ตรวจพบ PO ที่ไม่มี SO/PR | |
| ☐ | ตรวจพบ SO/PR ที่ไม่มี PO | |
| ☐ | ตรวจพบวันที่ส่งสินค้าไม่ถูกต้อง | |
| ☐ | แถวที่มี error ไม่ถูกนำเข้า, แถว warning ถูกนำเข้า | |
| ☐ | นำเข้าไฟล์ PO แล้วผูกกับ demand ที่อ้าง PO นั้นอัตโนมัติ | |
| ☐ | นำเข้าไฟล์ SO แล้วเติมลูกค้าให้ SO ที่มาจากไฟล์จัดซื้อ | |
| ☐ | ประวัติการนำเข้าแสดงไฟล์ จำนวนแถว ผ่าน/ไม่ผ่าน ผู้ทำ เวลา | |

## D. Supplier invoice (§1.3)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | อัปโหลด PDF Invoice ได้ | |
| ☐ | ระบบอ่านข้อมูลและแสดงให้ตรวจก่อน confirm | |
| ☐ | สถานะเดินครบ: Uploaded → Extracted → Pending verification → Verified | |
| ☐ | อ่านไม่ได้/ไม่มี API key ยังอัปโหลดได้และกรอกมือได้ | |
| ☐ | แก้ไขข้อมูลด้วยมือได้ทุกช่อง | |
| ☐ | ช่องที่แก้ด้วยมือแสดงเครื่องหมาย ✎ corrected | |
| ☐ | Verify ไม่ได้ถ้ายังมีบรรทัดที่ไม่ได้เลือกสินค้า | |
| ☐ | Verify ไม่ได้ถ้ายังไม่ผูก PO | |
| ☐ | Reject Invoice ได้พร้อมเหตุผล | |
| ☐ | Invoice ซ้ำถูกปฏิเสธพร้อมลิงก์ไปใบเดิม | |

## E. Purchasing (§2, §3)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | กระดาน Order management แสดง demand ที่ยังไม่มี PO | |
| ☐ | แสดง demand ที่มี PO แต่ไม่ครบจำนวน | |
| ☐ | ค้นหาด้วย PR / SO / สินค้า / ลูกค้า ได้ | |
| ☐ | กรองตาม Supplier ได้ | |
| ☐ | เลือกหลายบรรทัดของสินค้าเดียวกันแล้วรวมเป็น PO line เดียว | |
| ☐ | กรอก Supplier / Order Qty / Unit / MOQ / Price / Delivery / Remark ได้ | |
| ☐ | **สั่งเกิน demand โดยไม่ใส่เหตุผลไม่ได้** | |
| ☐ | เหตุผลมีครบ: MOQ, Pack size, Carton size, Min order value, Supplier requirement, Safety stock, Other | |
| ☐ | Supplier summary แสดง Required / Order / MOQ / Difference / Reason | |
| ☐ | กรองตาม Supplier / Product / Status / ช่วงวันที่ได้ | |
| ☐ | Export Excel ได้ และไฟล์เปิดใน Excel ถูกต้อง | |
| ☐ | PO vs Invoice แสดง Qty diff, Qty diff %, Price diff, Price diff % | |
| ☐ | **ยืนยันความต่างของจำนวนโดยไม่ใส่เหตุผลไม่ได้** | |
| ☐ | **ยืนยันความต่างของราคาโดยไม่ใส่เหตุผลไม่ได้** | |
| ☐ | หลังยืนยัน Corrected Quantity ถูกใช้เป็นฐานของทุกขั้นถัดไป | |
| ☐ | บันทึก User + Date/Time ของผู้ยืนยัน | |
| ☐ | Reject แล้ว PO line กลายเป็น BLOCKED | |

## F. Sales (§4, §6)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | Sales review แสดงรายการที่จำนวนไม่ตรงกับ SO | |
| ☐ | แสดง SO Qty / PO-Invoice Qty / Difference / Difference % | |
| ☐ | กรณีส่งไม่ครบ: ระบุลูกค้า จำนวนที่ลด เหตุผล การยอมรับ และ SO ใหม่ได้ | |
| ☐ | **บันทึกโดยไม่ใส่เหตุผลไม่ได้** | |
| ☐ | จำนวนใหม่เกินที่ยืนยันไว้ไม่ได้ | |
| ☐ | จำนวนเดิมของลูกค้ายังแสดงให้เห็น (ขีดฆ่า) | |
| ☐ | กรณีส่งเกิน: เลือกเพิ่มให้ลูกค้า หรือเข้าคลังได้ | |
| ☐ | เลือกเข้าคลังแล้ว **บังคับ** Quantity + Reason + Storage Location + Responsible Department | |
| ☐ | Allocation แสดง Actual Received / Allocated / Unallocated ตลอดเวลา | |
| ☐ | **Complete ไม่ได้จนกว่า Unallocated = 0** | |
| ☐ | จัดสรรเกินจำนวนจริงไม่ได้ | |
| ☐ | จัดสรรให้หลายลูกค้าในบรรทัดเดียวได้ | |
| ☐ | ตรวจสอบได้ว่า Allocated + Warehouse = Actual | |

## G. Warehouse (§7)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | เห็นเฉพาะรายการที่ผ่านทุกขั้นตอนแล้วเป็น Ready to receive | |
| ☐ | แสดงด่านทั้ง 6 พร้อมผลแต่ละด่าน | |
| ☐ | รายการที่ไม่ผ่านขึ้น **BLOCKED** พร้อมบอกว่าติดขั้นตอนใด | |
| ☐ | รับของแล้วบันทึก Actual Quantity ได้ | |
| ☐ | บันทึก Lot/Batch ได้ | |
| ☐ | บันทึกวันหมดอายุ (DLC) ได้ | |
| ☐ | บันทึก Storage Location ได้ | |
| ☐ | สินค้าชั่งน้ำหนัก: เพิ่มรายชิ้นและกรอกน้ำหนักได้ | |
| ☐ | Total Actual Weight คำนวณอัตโนมัติ | |
| ☐ | จ่ายแต่ละชิ้นให้ลูกค้าได้ | |
| ☐ | **รับของไม่ได้ถ้ายังชั่งไม่ครบ หรือยังจ่ายชิ้นไม่ครบ** | |
| ☐ | น้ำหนักที่จ่ายไม่ตรงกับที่ allocate จะถูกปฏิเสธ | |
| ☐ | หน้ารายละเอียดการรับแสดงรายชิ้นพร้อมลูกค้า | |
| ☐ | รับของหลายงวดต่อ PO เดียวได้ (§23) | |
| ☐ | งวดแรกทำให้สถานะเป็น PARTIALLY_RECEIVED | |
| ☐ | หน้ารับของงวดถัดไปตั้งจำนวนเป็นส่วนที่เหลือ และบอกว่ารับไปแล้วเท่าไร | |
| ☐ | รับเกินจำนวนที่ยืนยันไม่ได้ | |
| ☐ | รับครบแล้วเป็น FULLY_RECEIVED และ PO ปิด | |
| ☐ | บันทึกสภาพสินค้ารายชิ้น (good/damaged/rejected) ได้ | |
| ☐ | itemNo ซ้ำในบรรทัดเดียวกันไม่ได้ | |
| ☐ | จ่ายชิ้นให้ลูกค้าที่ไม่อยู่ใน allocation ไม่ได้ | |
| ☐ | ของที่เข้าคลังถูกสร้างเป็น Warehouse stock อัตโนมัติ | |
| ☐ | Warehouse stock แสดง supplier / PO / invoice / SO ต้นทาง / channel | |
| ☐ | ย้าย stock ต้องมีเหตุผลเสมอ | |
| ☐ | ย้ายเกินยอดคงเหลือไม่ได้ | |
| ☐ | ทุกการเคลื่อนไหวมี transaction พร้อมยอดคงเหลือ | |
| ☐ | สร้าง Shipment จากรายการที่จัดสรรแล้วได้ | |
| ☐ | หนึ่ง Shipment ต้องเป็นลูกค้าเดียว | |
| ☐ | ส่งซ้ำบรรทัดเดิมไม่ได้ | |

## G2. Performance reports (§33, §34)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | Supplier performance แสดง PO qty / Invoice qty / Actual qty | |
| ☐ | แสดง Short % และ Excess % | |
| ☐ | แสดง Price variance | |
| ☐ | แสดง Quantity accuracy % และ Price accuracy % | |
| ☐ | แสดง On-time delivery % | |
| ☐ | Channel performance แสดง SO / PO / Actual / Shipment / Short / Excess / Stock | |
| ☐ | channel ที่ยังไม่มีความเคลื่อนไหวยังขึ้นเป็นแถวศูนย์ | |
| ☐ | filter ตาม Supplier / Product / Channel / ช่วงวันที่ได้ | |

## H. Dashboard (§29–§32)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | Purchasing: PO Pending, Invoice mismatch, Qty diff, Price diff, PO ที่ยังไม่มี Invoice | |
| ☐ | Sales: SO ไม่ตรง, ต้องถามลูกค้า, ต้องลด, ส่งเกิน, ฝาก stock | |
| ☐ | Warehouse: Shipment วันนี้, Ready to receive, Pending allocation, Received, Blocked, Unallocated | |
| ☐ | Management: Total PO/SO/Invoice/Received/Allocation/Stock + Quantity/Price variance | |
| ☐ | ตาราง By business channel แสดงทุก channel ที่ผู้ใช้เห็นได้ | |
| ☐ | แถบเตือน cross-channel shortage ขึ้นเฉพาะคนที่อนุมัติได้ | |
| ☐ | ตัวนับ exception แสดงจำนวน overdue ด้วย | |
| ☐ | Supplier performance แสดงรายที่ส่งไม่ตรง PO | |
| ☐ | ตัวเลขทุกตัวกดแล้วไปที่คิวที่ถูกต้อง | |
| ☐ | ตัวเลขตรงกับข้อมูลจริงในฐานข้อมูล | |

## I. Search & Filter (§17)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | ค้นหาด้วย PO ได้ | |
| ☐ | ค้นหาด้วย SO ได้ | |
| ☐ | ค้นหาด้วย PR ได้ | |
| ☐ | ค้นหาด้วย Invoice ได้ | |
| ☐ | กรองด้วย Supplier ได้ | |
| ☐ | กรองด้วย Customer ได้ | |
| ☐ | กรองด้วย Product ได้ | |
| ☐ | กรองด้วยช่วง Delivery Date ได้ | |
| ☐ | กรองด้วย Status ได้ | |
| ☐ | Audit trail ค้นด้วย document / user / field / value / reason ได้ | |

## J. Exception & Notification (§15, §16)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | Exception ทุกรายการมี Reason, Responsible Dept, **Owner**, Action, Due Date, **Priority**, Status | |
| ☐ | Exception Center แสดง channel ของแต่ละรายการ | |
| ☐ | เรียงตาม overdue → priority → วันครบกำหนด | |
| ☐ | แสดงสถานะ SLA (On track / Due soon / Overdue / Completed) | |
| ☐ | เปลี่ยนแผนกที่รับผิดชอบได้ | |
| ☐ | เปลี่ยนกำหนดเสร็จได้ | |
| ☐ | Start / Resolve พร้อม resolution ได้ | |
| ☐ | Exception ที่เกินกำหนดแสดงเป็นสีแดง | |
| ☐ | Exception ถูกปิดอัตโนมัติเมื่อ workflow เดินหน้า | |
| ☐ | แจ้งเตือนไปถึงแผนกที่ต้องลงมือ | |
| ☐ | กดแจ้งเตือนแล้วไปหน้าที่ถูกต้อง | |

## K. Audit trail & Traceability (§12, §13)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | ทุกการแก้ไขสำคัญบันทึก User / Date / Time / Field / Old / New / Reason / Document | |
| ☐ | ข้อมูลเดิมไม่ถูกลบ (`originalQuantity` ยังอยู่) | |
| ☐ | Master data ถูกปิดการใช้งานแทนการลบ | |
| ☐ | เปิด PO แล้วเห็น SO, Invoice, Receiving, Allocation ที่เกี่ยวข้องครบ | |
| ☐ | เปิด SO แล้วเห็นสายเอกสารทั้งหมด | |
| ☐ | Progress stepper แสดงสถานะแต่ละขั้น | |
| ☐ | ตารางจำนวนแสดง SO / PO / Invoice / Confirmed / Received / Allocated | |
| ☐ | Export audit trail เป็น Excel ได้ | |

## L. Role & Permission (§10, §21)

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | ผู้ใช้ที่ยังไม่มีแผนกเข้าโมดูลไม่ได้ | |
| ☐ | Admin กำหนดแผนกให้ผู้ใช้ได้ที่ Settings → Users | |
| ☐ | การเปลี่ยนแผนกถูกบันทึกลง audit | |
| ☐ | Purchasing เห็นและทำได้เฉพาะงานจัดซื้อ | |
| ☐ | Sales เห็นและทำได้เฉพาะงานขาย | |
| ☐ | Warehouse เห็นและทำได้เฉพาะงานคลัง | |
| ☐ | Management เห็นทุกอย่างแต่แก้ไม่ได้ | |
| ☐ | ยิง API ตรงข้ามสิทธิ์ถูกปฏิเสธด้วย 403 | |
| ☐ | ข้ามขั้นตอน workflow ไม่ได้แม้ยิง API ตรง | |

## M. คุณภาพระบบ

| ✔ | รายการ | ผู้ตรวจ |
|:--:|---|---|
| ☐ | `npm test` ผ่านทั้งหมด | |
| ☐ | `npm run lint` ไม่มี error | |
| ☐ | `npm run build` สำเร็จ | |
| ☐ | หน้าจอใช้งานได้บนมือถือ (sidebar ยุบเป็นเมนู) | |
| ☐ | ไม่มี console error ในเบราว์เซอร์ | |
| ☐ | ข้อความ error ที่ผู้ใช้เห็นบอกได้ว่าต้องทำอะไรต่อ | |

---

**สรุปผล UAT**

| | |
|---|---|
| วันที่ทดสอบ | |
| ผู้ทดสอบ | |
| จำนวนรายการทั้งหมด | |
| ผ่าน | |
| ไม่ผ่าน | |
| ข้อสังเกต | |
| อนุมัติขึ้นใช้งานโดย | |
