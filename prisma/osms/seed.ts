/**
 * Sample data for OSMS — the Order & Supply Management System.
 *
 * OSMS owns its database outright, so this seed builds the master data too:
 * units, channels, departments, suppliers, customers, products and tolerance
 * rules, then six scenarios on top of them. It talks to no other system.
 *
 * Six scenarios across the four business channels, each parked at a different
 * point in the workflow so every screen has something real to show:
 *
 *   A — clean match ............ FS: invoice equals the PO, auto-approved,
 *                                waiting for allocation
 *   B — supplier short ......... FS: invoice < PO with a price rise, waiting
 *                                for purchasing to confirm
 *   C — MOQ over-order ......... RTL: PO > demand with a recorded reason
 *   D — weighed product ........ FS + STR: king crab bought by the piece
 *   E — cross-channel shortage . the §45 example: 2,000 KG of salmon ordered
 *                                across all four channels, 1,700 delivered,
 *                                waiting for management to rank the channels
 *   F — open demand ............ CK + RTL lines with no PO yet
 *
 * Everything is wiped and rebuilt so the sample stays reproducible.
 */
import { PrismaClient } from "../../lib/generated/osms";

const UNITS = [
  { code: "KG", name: "Kilogram", dimension: "weight" },
  { code: "G", name: "Gram", dimension: "weight" },
  { code: "PC", name: "Piece", dimension: "count" },
  { code: "TIN", name: "Tin", dimension: "count" },
  { code: "BOX", name: "Box", dimension: "count" },
  { code: "CARTON", name: "Carton", dimension: "count" },
  { code: "PACK", name: "Pack", dimension: "count" },
  { code: "CASE", name: "Case", dimension: "count" },
  { code: "PK", name: "Pack (legacy)", dimension: "count" },
];

const GLOBAL_CONVERSIONS = [
  { fromUnit: "KG", toUnit: "G", factor: 1000 },
  { fromUnit: "CARTON", toUnit: "BOX", factor: 1 },
  { fromUnit: "CASE", toUnit: "BOX", factor: 1 },
  { fromUnit: "PK", toUnit: "PACK", factor: 1 },
  { fromUnit: "TIN", toUnit: "PC", factor: 1 },
];

const CHANNELS = [
  { code: "FS", name: "Food Service", nameTh: "ฟู้ดเซอร์วิส", sortOrder: 1, defaultPriority: 10 },
  { code: "RTL", name: "Retail", nameTh: "ค้าปลีก", sortOrder: 2, defaultPriority: 20 },
  { code: "STR", name: "Store", nameTh: "ร้านค้า", sortOrder: 3, defaultPriority: 30 },
  { code: "CK", name: "Central Kitchen", nameTh: "ครัวกลาง", sortOrder: 4, defaultPriority: 40 },
];

const DEPARTMENTS = [
  { code: "admin", name: "Admin", nameTh: "ผู้ดูแลระบบ", sortOrder: 1 },
  { code: "purchasing", name: "Purchasing", nameTh: "จัดซื้อ", sortOrder: 2 },
  { code: "sales", name: "Sales", nameTh: "ฝ่ายขาย", sortOrder: 3 },
  { code: "warehouse", name: "Warehouse", nameTh: "คลังสินค้า", sortOrder: 4 },
  { code: "management", name: "Management", nameTh: "ผู้บริหาร", sortOrder: 5 },
  { code: "none", name: "No department", nameTh: "ยังไม่กำหนด", sortOrder: 9 },
];

const ROLES = [
  {
    code: "owner",
    name: "Owner",
    nameTh: "เจ้าของระบบ",
    description: "Full access; the account matching OWNER_EMAIL.",
    sortOrder: 1,
  },
  {
    code: "member",
    name: "Team member",
    nameTh: "ผู้ใช้งาน",
    description: "Access follows the department and the assigned channels.",
    sortOrder: 2,
  },
];

const SUPPLIERS = [
  {
    code: "CHP",
    name: "Caviar House Paris",
    currency: "EUR",
    defaultUnit: "TIN",
    moq: null as number | null,
    leadTimeDays: 21,
    contactEmail: "orders@caviarhouse.example",
    address: "Paris, France",
  },
  {
    code: "NORSEA",
    name: "Nordic Seafood A/S",
    currency: "EUR",
    defaultUnit: "KG",
    moq: 100,
    leadTimeDays: 14,
    contactEmail: "sales@nordicseafood.example",
    address: "Hirtshals, Denmark",
  },
  {
    code: "OCEANTH",
    name: "Ocean Thai Import",
    currency: "THB",
    defaultUnit: "KG",
    moq: 50,
    leadTimeDays: 7,
    contactEmail: "sales@oceanthai.example",
    address: "Bangkok, Thailand",
  },
];

const CUSTOMERS = [
  // Food Service
  {
    code: "C001",
    name: "Mandarin Oriental Bangkok",
    nameTh: "แมนดาริน โอเรียนเต็ล กรุงเทพ",
    channel: "FS",
    deliveryLocation: "Bangkok — Charoen Krung",
    salesOwner: "Ploy",
  },
  {
    code: "C002",
    name: "Blue Elephant Restaurant",
    nameTh: "บลูเอเลเฟ่นท์",
    channel: "FS",
    deliveryLocation: "Bangkok — Sathorn",
    salesOwner: "Ploy",
  },
  {
    code: "C003",
    name: "Sirocco Sky Dining",
    nameTh: "สิรอคโค",
    channel: "FS",
    deliveryLocation: "Bangkok — Silom",
    salesOwner: "Ploy",
  },
  // Retail
  {
    code: "C010",
    name: "Gourmet Market Paragon",
    nameTh: "กูร์เมต์ มาร์เก็ต พารากอน",
    channel: "RTL",
    deliveryLocation: "Bangkok — Siam",
    salesOwner: "Nattapong",
  },
  {
    code: "C011",
    name: "Villa Market Thonglor",
    nameTh: "วิลล่า มาร์เก็ต ทองหล่อ",
    channel: "RTL",
    deliveryLocation: "Bangkok — Thonglor",
    salesOwner: "Nattapong",
  },
  // Store
  {
    code: "S001",
    name: "Flagship Store Bangkok",
    nameTh: "ร้านคาเวียรี กรุงเทพ",
    channel: "STR",
    deliveryLocation: "Bangkok — Sukhumvit 39",
    salesOwner: "Mai",
  },
  {
    code: "S002",
    name: "Flagship Store Phuket",
    nameTh: "ร้านคาเวียรี ภูเก็ต",
    channel: "STR",
    deliveryLocation: "Phuket — Bang Tao",
    salesOwner: "Mai",
  },
  // Central Kitchen
  {
    code: "CK001",
    name: "Central Kitchen Bangna",
    nameTh: "ครัวกลาง บางนา",
    channel: "CK",
    deliveryLocation: "Samut Prakan — Bangna KM.19",
    salesOwner: "Korn",
  },
];

/** Products the sample scenarios use, with their supply-chain settings. */
const PRODUCT_SETUP = [
  {
    code: "3193",
    name: "Caviar Classic 125 g",
    nameTh: "คาเวียร์ คลาสสิก 125 กรัม",
    category: "CAVIAR",
    unit: "TIN",
    gramsPerUnit: 125,
    unitCost: 78,
    purchaseUnit: "BOX",
    purchaseConversion: 12,
    moq: 2,
    supplier: "CHP",
    weightControlled: false,
    lotRequired: true,
    expiryRequired: true,
  },
  {
    code: "3134",
    name: "Caviar Reserve 125 g",
    nameTh: "คาเวียร์ รีเซิร์ฟ 125 กรัม",
    category: "CAVIAR",
    unit: "TIN",
    gramsPerUnit: 125,
    unitCost: 96,
    purchaseUnit: "BOX",
    purchaseConversion: 12,
    moq: 2,
    supplier: "CHP",
    weightControlled: false,
    lotRequired: true,
    expiryRequired: true,
  },
  {
    code: "1216",
    name: "Caviar Classic 30 g",
    nameTh: "คาเวียร์ คลาสสิก 30 กรัม",
    category: "CAVIAR",
    unit: "TIN",
    gramsPerUnit: 30,
    unitCost: 24,
    purchaseUnit: "BOX",
    purchaseConversion: 24,
    moq: 1,
    supplier: "CHP",
    weightControlled: false,
    lotRequired: true,
    expiryRequired: true,
  },
  {
    code: "3208",
    name: "King crab leg, frozen",
    nameTh: "ขาปูคิงแครบแช่แข็ง 130 กรัม/ชิ้น",
    category: "SEAFOOD",
    unit: "KG",
    gramsPerUnit: 130,
    unitCost: 46,
    purchaseUnit: "KG",
    purchaseConversion: 1,
    moq: 20,
    supplier: "NORSEA",
    // Weighed piece by piece: every received item carries its own net weight
    // and is allocated to a customer individually.
    weightControlled: true,
    lotRequired: true,
    expiryRequired: true,
  },
  {
    code: "3168",
    name: "Smoked salmon fillet",
    nameTh: "แซลมอนรมควัน",
    category: "SEAFOOD",
    unit: "KG",
    gramsPerUnit: null as number | null,
    unitCost: 18.5,
    purchaseUnit: "KG",
    purchaseConversion: 1,
    moq: 10,
    supplier: "NORSEA",
    weightControlled: false,
    lotRequired: true,
    expiryRequired: true,
  },
];

function day(offsetDays: number): Date {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export async function seedSupplyChain(osms: PrismaClient): Promise<void> {
  console.log("Clearing supply-chain data…");
  // Children first — SQLite enforces the foreign keys.
  await osms.warehouseStockTransaction.deleteMany();
  await osms.warehouseStock.deleteMany();
  await osms.shortageAllocation.deleteMany();
  await osms.shortageCase.deleteMany();
  await osms.shipmentLine.deleteMany();
  await osms.shipment.deleteMany();
  await osms.receivingItem.deleteMany();
  await osms.receivingLine.deleteMany();
  await osms.receiving.deleteMany();
  await osms.allocationLine.deleteMany();
  await osms.allocation.deleteMany();
  await osms.soPoRecon.deleteMany();
  await osms.poInvoiceRecon.deleteMany();
  await osms.invoiceLine.deleteMany();
  await osms.invoice.deleteMany();
  await osms.soPoMapping.deleteMany();
  await osms.purchaseOrderLine.deleteMany();
  await osms.purchaseOrder.deleteMany();
  await osms.purchaseRequestLine.deleteMany();
  await osms.purchaseRequest.deleteMany();
  await osms.salesOrderLine.deleteMany();
  await osms.salesOrder.deleteMany();
  await osms.exception.deleteMany();
  await osms.notification.deleteMany();
  await osms.auditLog.deleteMany();
  await osms.attachment.deleteMany();
  await osms.importBatch.deleteMany();
  await osms.unitConversion.deleteMany();
  await osms.unit.deleteMany();
  await osms.tolerance.deleteMany();
  await osms.product.deleteMany();
  await osms.customer.deleteMany();
  await osms.supplier.deleteMany();
  await osms.userChannel.deleteMany();
  await osms.businessChannel.deleteMany();
  await osms.department.deleteMany();
  await osms.role.deleteMany();

  console.log("Seeding business channels, departments and roles…");
  const channelByCode = new Map<string, string>();
  for (const channel of CHANNELS) {
    const created = await osms.businessChannel.create({ data: channel });
    channelByCode.set(channel.code, created.id);
  }
  for (const department of DEPARTMENTS) {
    await osms.department.create({ data: department });
  }
  for (const role of ROLES) {
    await osms.role.create({ data: role });
  }

  console.log("Seeding units and conversions…");
  for (const unit of UNITS) {
    await osms.unit.create({ data: unit });
  }
  for (const conversion of GLOBAL_CONVERSIONS) {
    await osms.unitConversion.create({
      data: {
        key: `*:${conversion.fromUnit}:${conversion.toUnit}`,
        fromUnit: conversion.fromUnit,
        toUnit: conversion.toUnit,
        factor: conversion.factor,
      },
    });
  }

  console.log("Seeding suppliers and customers…");
  const supplierByCode = new Map<string, string>();
  for (const supplier of SUPPLIERS) {
    const created = await osms.supplier.create({ data: supplier });
    supplierByCode.set(supplier.code, created.id);
  }
  const customerByCode = new Map<string, string>();
  for (const customer of CUSTOMERS) {
    const { channel, ...data } = customer;
    const created = await osms.customer.create({
      data: { ...data, channelId: channelByCode.get(channel) ?? null },
    });
    customerByCode.set(customer.code, created.id);
  }

  console.log("Seeding tolerance rules…");
  // Global default: every difference needs a human. Two exceptions show how
  // the master narrows that down per supplier and per channel (§28).
  await osms.tolerance.createMany({
    data: [
      {
        key: "global:*",
        scope: "global",
        qtyTolerancePct: 0,
        priceTolerancePct: 0,
        weightTolerancePct: 0,
        note: "Every difference is reviewed unless a narrower rule applies.",
      },
      {
        key: `supplier:${supplierByCode.get("NORSEA")}`,
        scope: "supplier",
        supplierId: supplierByCode.get("NORSEA")!,
        qtyTolerancePct: 2,
        priceTolerancePct: 0,
        weightTolerancePct: 5,
        note: "Fresh seafood is weighed on arrival — 2% on quantity is normal.",
      },
      {
        key: `channel:${channelByCode.get("STR")}`,
        scope: "channel",
        channelId: channelByCode.get("STR")!,
        qtyTolerancePct: 5,
        priceTolerancePct: 1,
        weightTolerancePct: 5,
        note: "Own stores absorb small differences without a review.",
      },
    ],
  });

  console.log("Building the product master…");
  const productByCode = new Map<
    string,
    { id: string; unit: string; name: string; unitCost: number }
  >();
  for (const setup of PRODUCT_SETUP) {
    const updated = await osms.product.create({
      data: {
        code: setup.code,
        name: setup.name,
        nameTh: setup.nameTh,
        category: setup.category,
        unit: setup.unit,
        gramsPerUnit: setup.gramsPerUnit,
        purchaseUnit: setup.purchaseUnit,
        purchaseConversion: setup.purchaseConversion,
        moq: setup.moq,
        defaultSupplierId: supplierByCode.get(setup.supplier) ?? null,
        weightControlled: setup.weightControlled,
        lotRequired: setup.lotRequired,
        expiryRequired: setup.expiryRequired,
      },
    });
    productByCode.set(setup.code, {
      id: updated.id,
      unit: updated.unit,
      name: updated.name,
      unitCost: setup.unitCost,
    });
    // Product-specific purchase-unit conversion (1 BOX = 12 tins…).
    if (setup.purchaseUnit && setup.purchaseUnit !== updated.unit) {
      await osms.unitConversion.create({
        data: {
          key: `${updated.id}:${setup.purchaseUnit}:${updated.unit.toUpperCase()}`,
          productId: updated.id,
          fromUnit: setup.purchaseUnit,
          toUnit: updated.unit.toUpperCase(),
          factor: setup.purchaseConversion,
        },
      });
    }
  }

  const kristal = productByCode.get("3193");
  const oscietra = productByCode.get("3134");
  const kristalSmall = productByCode.get("1216");
  const kingCrab = productByCode.get("3208");
  if (!kristal || !oscietra || !kristalSmall || !kingCrab) {
    console.warn("Sample scenarios skipped — catalog products missing.");
    return;
  }

  const audit: {
    entity: string;
    entityId: string;
    documentNumber: string;
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    reason?: string;
    userName: string;
    department: string;
  }[] = [];

  // =====================================================================
  // Scenario A — clean match: SO → PR → PO → invoice → auto-approved
  // =====================================================================
  const soA = await osms.salesOrder.create({
    data: {
      soNumber: "SO-2026-0101",
      channelId: channelByCode.get("FS")!,
      customerId: customerByCode.get("C001")!,
      orderDate: day(-12),
      deliveryDate: day(4),
      requester: "Ploy",
      currency: "THB",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kristal.id,
            quantity: 24,
            unit: kristal.unit,
            baseQuantity: 24,
            unitPrice: 4800,
            priceUnit: kristal.unit,
            currency: "THB",
            deliveryDate: day(4),
            originalQuantity: 24,
            poNumberRef: "PO-2026-0001",
            status: "PO_INVOICE_MATCHED",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const prA = await osms.purchaseRequest.create({
    data: {
      prNumber: "PR-2026-0101",
      requester: "Ploy",
      department: "sales",
      requestDate: day(-12),
      status: "ordered",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kristal.id,
            quantity: 24,
            unit: kristal.unit,
            baseQuantity: 24,
            deliveryDate: day(4),
            soLineId: soA.lines[0].id,
            poNumberRef: "PO-2026-0001",
            status: "PO_INVOICE_MATCHED",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const poA = await osms.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-0001",
      supplierId: supplierByCode.get("CHP")!,
      orderDate: day(-10),
      expectedDeliveryDate: day(4),
      currency: "EUR",
      status: "invoiced",
      createdByName: "Anna (purchasing)",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kristal.id,
            quantity: 2,
            unit: "BOX",
            baseQuantity: 24,
            unitPrice: kristal.unitCost,
            priceUnit: kristal.unit,
            currency: "EUR",
            deliveryDate: day(4),
            requiredQuantity: 24,
            moq: 2,
            status: "PO_INVOICE_MATCHED",
          },
        ],
      },
    },
    include: { lines: true },
  });

  await osms.soPoMapping.create({
    data: {
      poId: poA.id,
      poLineId: poA.lines[0].id,
      prLineId: prA.lines[0].id,
      soLineId: soA.lines[0].id,
      soId: soA.id,
      productId: kristal.id,
      quantity: 24,
      unit: "BOX",
      createdByName: "Anna (purchasing)",
    },
  });

  const invoiceA = await osms.invoice.create({
    data: {
      invoiceNumber: "INV-KAV-88012",
      supplierId: supplierByCode.get("CHP")!,
      poId: poA.id,
      poNumberRaw: "PO-2026-0001",
      supplierNameRaw: "Caviar House Paris",
      invoiceDate: day(-3),
      deliveryDate: day(4),
      currency: "EUR",
      status: "verified",
      fileName: "INV-KAV-88012.pdf",
      extractionMode: "ai",
      uploadedByName: "Anna (purchasing)",
      verifiedByName: "Anna (purchasing)",
      verifiedAt: day(-2),
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kristal.id,
            productCodeRaw: "3193",
            descriptionRaw: "CAVIAR KRISTAL 125G",
            quantity: 24,
            unit: kristal.unit,
            baseQuantity: 24,
            unitPrice: kristal.unitCost,
            priceUnit: kristal.unit,
            currency: "EUR",
            deliveryDate: day(4),
            poLineId: poA.lines[0].id,
          },
        ],
      },
    },
    include: { lines: true },
  });

  await osms.poInvoiceRecon.create({
    data: {
      poId: poA.id,
      poLineId: poA.lines[0].id,
      invoiceId: invoiceA.id,
      invoiceLineId: invoiceA.lines[0].id,
      productId: kristal.id,
      poQuantity: 24,
      invoiceQuantity: 24,
      qtyDiff: 0,
      qtyDiffPct: 0,
      poUnitPrice: kristal.unitCost,
      invoiceUnitPrice: kristal.unitCost,
      priceDiff: 0,
      priceDiffPct: 0,
      qtyStatus: "match",
      priceStatus: "match",
      correctedQuantity: 24,
      status: "approved",
      reviewedByName: "System (auto-match)",
      reviewedAt: day(-2),
    },
  });

  await osms.purchaseOrderLine.update({
    where: { id: poA.lines[0].id },
    data: {
      correctedQuantity: 24,
      correctedReason: "AUTO_MATCH",
      correctedAt: day(-2),
      correctedByName: "System (auto-match)",
      status: "PENDING_ALLOCATION",
    },
  });

  await osms.soPoRecon.create({
    data: {
      soLineId: soA.lines[0].id,
      poLineId: poA.lines[0].id,
      productId: kristal.id,
      soQuantity: 24,
      confirmedQuantity: 24,
      diff: 0,
      diffPct: 0,
      diffStatus: "match",
      status: "completed",
      decision: "keep_so",
      reviewedByName: "System (auto-match)",
      reviewedAt: day(-2),
    },
  });
  await osms.salesOrderLine.update({
    where: { id: soA.lines[0].id },
    data: { confirmedQuantity: 24, status: "PENDING_ALLOCATION" },
  });

  audit.push({
    entity: "invoice",
    entityId: invoiceA.id,
    documentNumber: "INV-KAV-88012",
    action: "approve",
    field: "status",
    oldValue: "pending_verification",
    newValue: "verified",
    reason: "Every line matched the PO",
    userName: "Anna (purchasing)",
    department: "purchasing",
  });

  // =====================================================================
  // Scenario B — supplier short-shipped: waiting for purchasing (§3.1)
  // =====================================================================
  const soB = await osms.salesOrder.create({
    data: {
      soNumber: "SO-2026-0102",
      channelId: channelByCode.get("FS")!,
      customerId: customerByCode.get("C002")!,
      orderDate: day(-9),
      deliveryDate: day(6),
      requester: "Ploy",
      currency: "THB",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: oscietra.id,
            quantity: 36,
            unit: oscietra.unit,
            baseQuantity: 36,
            unitPrice: 5200,
            priceUnit: oscietra.unit,
            currency: "THB",
            deliveryDate: day(6),
            originalQuantity: 36,
            poNumberRef: "PO-2026-0002",
            status: "PENDING_PO_INVOICE_RECONCILIATION",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const poB = await osms.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-0002",
      supplierId: supplierByCode.get("CHP")!,
      orderDate: day(-8),
      expectedDeliveryDate: day(6),
      currency: "EUR",
      status: "invoiced",
      createdByName: "Anna (purchasing)",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: oscietra.id,
            quantity: 3,
            unit: "BOX",
            baseQuantity: 36,
            unitPrice: oscietra.unitCost,
            priceUnit: oscietra.unit,
            currency: "EUR",
            deliveryDate: day(6),
            requiredQuantity: 36,
            moq: 2,
            status: "PENDING_PO_INVOICE_RECONCILIATION",
          },
        ],
      },
    },
    include: { lines: true },
  });

  await osms.soPoMapping.create({
    data: {
      poId: poB.id,
      poLineId: poB.lines[0].id,
      soLineId: soB.lines[0].id,
      soId: soB.id,
      productId: oscietra.id,
      quantity: 36,
      unit: "BOX",
      createdByName: "Anna (purchasing)",
    },
  });

  const invoiceB = await osms.invoice.create({
    data: {
      invoiceNumber: "INV-KAV-88044",
      supplierId: supplierByCode.get("CHP")!,
      poId: poB.id,
      poNumberRaw: "PO-2026-0002",
      supplierNameRaw: "Caviar House Paris",
      invoiceDate: day(-1),
      deliveryDate: day(6),
      currency: "EUR",
      status: "verified",
      fileName: "INV-KAV-88044.pdf",
      extractionMode: "ai",
      uploadedByName: "Anna (purchasing)",
      verifiedByName: "Anna (purchasing)",
      verifiedAt: day(-1),
      lines: {
        create: [
          {
            lineNo: 1,
            productId: oscietra.id,
            productCodeRaw: "3134",
            descriptionRaw: "CAVIAR OSCIETRA PRESTIGE 125G",
            quantity: 30,
            unit: oscietra.unit,
            baseQuantity: 30,
            unitPrice: round(oscietra.unitCost * 1.04),
            priceUnit: oscietra.unit,
            currency: "EUR",
            deliveryDate: day(6),
            poLineId: poB.lines[0].id,
            editedFields: "quantity",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const invoicePriceB = round(oscietra.unitCost * 1.04);
  await osms.poInvoiceRecon.create({
    data: {
      poId: poB.id,
      poLineId: poB.lines[0].id,
      invoiceId: invoiceB.id,
      invoiceLineId: invoiceB.lines[0].id,
      productId: oscietra.id,
      poQuantity: 36,
      invoiceQuantity: 30,
      qtyDiff: -6,
      qtyDiffPct: -16.67,
      poUnitPrice: oscietra.unitCost,
      invoiceUnitPrice: invoicePriceB,
      priceDiff: round(invoicePriceB - oscietra.unitCost),
      priceDiffPct: 4,
      qtyStatus: "short",
      priceStatus: "higher",
      status: "pending_review",
    },
  });

  await osms.exception.create({
    data: {
      code: "EXC-2026-0001",
      type: "SUPPLIER_SHORT",
      severity: "high",
      priority: "high",
      channelId: channelByCode.get("FS")!,
      ownerName: "Anna (purchasing)",
      documentType: "po_line",
      documentId: poB.lines[0].id,
      documentNumber: "PO-2026-0002",
      productId: oscietra.id,
      description: "Invoice quantity 30 vs PO quantity 36.",
      responsibleDept: "purchasing",
      action: "Confirm the corrected quantity/price and record the reason.",
      dueDate: day(1),
      status: "open",
      createdByName: "System",
    },
  });

  await osms.notification.create({
    data: {
      department: "purchasing",
      channelId: channelByCode.get("FS")!,
      type: "po_invoice_mismatch",
      severity: "warning",
      title: "PO-2026-0002: 1 line does not match the invoice",
      body: "Confirm the corrected quantity and record a reason before the goods can be received.",
      documentType: "po",
      documentId: poB.id,
      documentNumber: "PO-2026-0002",
      link: `/osms/purchasing/po-invoice?po=${poB.id}`,
    },
  });

  audit.push({
    entity: "invoice_line",
    entityId: invoiceB.lines[0].id,
    documentNumber: "INV-KAV-88044",
    action: "update",
    field: "quantity",
    oldValue: "36",
    newValue: "30",
    reason: "Manual correction after extraction",
    userName: "Anna (purchasing)",
    department: "purchasing",
  });

  // =====================================================================
  // Scenario C — MOQ over-order, invoice not received yet (§2)
  // =====================================================================
  const soC = await osms.salesOrder.create({
    data: {
      soNumber: "SO-2026-0103",
      channelId: channelByCode.get("RTL")!,
      customerId: customerByCode.get("C010")!,
      orderDate: day(-4),
      deliveryDate: day(12),
      requester: "Nattapong",
      currency: "THB",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kristalSmall.id,
            quantity: 18,
            unit: kristalSmall.unit,
            baseQuantity: 18,
            unitPrice: 1450,
            priceUnit: kristalSmall.unit,
            currency: "THB",
            deliveryDate: day(12),
            originalQuantity: 18,
            poNumberRef: "PO-2026-0003",
            status: "PENDING_INVOICE",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const poC = await osms.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-0003",
      supplierId: supplierByCode.get("CHP")!,
      orderDate: day(-3),
      expectedDeliveryDate: day(12),
      currency: "EUR",
      status: "issued",
      notes: "Rounded up to a full box — the supplier does not split boxes.",
      createdByName: "Anna (purchasing)",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kristalSmall.id,
            quantity: 1,
            unit: "BOX",
            baseQuantity: 24,
            unitPrice: kristalSmall.unitCost,
            priceUnit: kristalSmall.unit,
            currency: "EUR",
            deliveryDate: day(12),
            requiredQuantity: 18,
            moq: 1,
            adjustmentReason: "MOQ",
            adjustmentNote: "Minimum one box of 24 tins.",
            status: "PENDING_INVOICE",
          },
        ],
      },
    },
    include: { lines: true },
  });

  await osms.soPoMapping.create({
    data: {
      poId: poC.id,
      poLineId: poC.lines[0].id,
      soLineId: soC.lines[0].id,
      soId: soC.id,
      productId: kristalSmall.id,
      quantity: 18,
      unit: "BOX",
      reason: "Rounded up to a full box — the extra 6 tins need a home.",
      createdByName: "Anna (purchasing)",
    },
  });

  await osms.exception.create({
    data: {
      code: "EXC-2026-0002",
      type: "MOQ",
      severity: "low",
      priority: "low",
      channelId: channelByCode.get("RTL")!,
      ownerName: "Nattapong",
      documentType: "po_line",
      documentId: poC.lines[0].id,
      documentNumber: "PO-2026-0003",
      productId: kristalSmall.id,
      description: "PO-2026-0003 line 1: ordered 24 against a demand of 18.",
      reason: "MOQ",
      responsibleDept: "sales",
      action: "Decide where the extra 6 tins go once the goods arrive.",
      dueDate: day(10),
      status: "open",
      createdByName: "Anna (purchasing)",
    },
  });

  audit.push({
    entity: "purchase_order",
    entityId: poC.id,
    documentNumber: "PO-2026-0003",
    action: "create",
    field: "line 1 quantity",
    oldValue: "18",
    newValue: "24",
    reason: "MOQ",
    userName: "Anna (purchasing)",
    department: "purchasing",
  });

  // =====================================================================
  // Scenario D — weighed product, allocation split across two customers
  // =====================================================================
  const soD1 = await osms.salesOrder.create({
    data: {
      soNumber: "SO-2026-0104",
      channelId: channelByCode.get("FS")!,
      customerId: customerByCode.get("C001")!,
      orderDate: day(-6),
      deliveryDate: day(2),
      requester: "Ploy",
      currency: "THB",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kingCrab.id,
            quantity: 12,
            unit: kingCrab.unit,
            baseQuantity: 12,
            unitPrice: 3200,
            priceUnit: kingCrab.unit,
            currency: "THB",
            deliveryDate: day(2),
            originalQuantity: 12,
            confirmedQuantity: 12,
            poNumberRef: "PO-2026-0004",
            status: "PENDING_ALLOCATION",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const soD2 = await osms.salesOrder.create({
    data: {
      soNumber: "SO-2026-0105",
      channelId: channelByCode.get("STR")!,
      customerId: customerByCode.get("S001")!,
      orderDate: day(-6),
      deliveryDate: day(2),
      requester: "Nattapong",
      currency: "THB",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kingCrab.id,
            quantity: 8,
            unit: kingCrab.unit,
            baseQuantity: 8,
            unitPrice: 3350,
            priceUnit: kingCrab.unit,
            currency: "THB",
            deliveryDate: day(2),
            originalQuantity: 8,
            confirmedQuantity: 8,
            poNumberRef: "PO-2026-0004",
            status: "PENDING_ALLOCATION",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const poD = await osms.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-0004",
      supplierId: supplierByCode.get("NORSEA")!,
      orderDate: day(-6),
      expectedDeliveryDate: day(2),
      currency: "EUR",
      status: "invoiced",
      createdByName: "Anna (purchasing)",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kingCrab.id,
            quantity: 20,
            unit: "KG",
            baseQuantity: 20,
            unitPrice: 58,
            priceUnit: "KG",
            currency: "EUR",
            deliveryDate: day(2),
            requiredQuantity: 20,
            moq: 20,
            status: "PENDING_ALLOCATION",
          },
        ],
      },
    },
    include: { lines: true },
  });

  await osms.soPoMapping.createMany({
    data: [
      {
        poId: poD.id,
        poLineId: poD.lines[0].id,
        soLineId: soD1.lines[0].id,
        soId: soD1.id,
        productId: kingCrab.id,
        quantity: 12,
        unit: "KG",
        createdByName: "Anna (purchasing)",
      },
      {
        poId: poD.id,
        poLineId: poD.lines[0].id,
        soLineId: soD2.lines[0].id,
        soId: soD2.id,
        productId: kingCrab.id,
        quantity: 8,
        unit: "KG",
        createdByName: "Anna (purchasing)",
      },
    ],
  });

  const invoiceD = await osms.invoice.create({
    data: {
      invoiceNumber: "INV-NOR-20451",
      supplierId: supplierByCode.get("NORSEA")!,
      poId: poD.id,
      poNumberRaw: "PO-2026-0004",
      supplierNameRaw: "Nordic Seafood A/S",
      invoiceDate: day(-2),
      deliveryDate: day(2),
      currency: "EUR",
      status: "verified",
      fileName: "INV-NOR-20451.pdf",
      extractionMode: "ai",
      uploadedByName: "Anna (purchasing)",
      verifiedByName: "Anna (purchasing)",
      verifiedAt: day(-2),
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kingCrab.id,
            productCodeRaw: "3208",
            descriptionRaw: "FZ KING CRAB 130G/PC",
            quantity: 20,
            unit: "KG",
            baseQuantity: 20,
            unitPrice: 58,
            priceUnit: "KG",
            currency: "EUR",
            deliveryDate: day(2),
            poLineId: poD.lines[0].id,
          },
        ],
      },
    },
    include: { lines: true },
  });

  await osms.poInvoiceRecon.create({
    data: {
      poId: poD.id,
      poLineId: poD.lines[0].id,
      invoiceId: invoiceD.id,
      invoiceLineId: invoiceD.lines[0].id,
      productId: kingCrab.id,
      poQuantity: 20,
      invoiceQuantity: 20,
      qtyDiff: 0,
      qtyDiffPct: 0,
      poUnitPrice: 58,
      invoiceUnitPrice: 58,
      priceDiff: 0,
      priceDiffPct: 0,
      qtyStatus: "match",
      priceStatus: "match",
      correctedQuantity: 20,
      status: "approved",
      reviewedByName: "System (auto-match)",
      reviewedAt: day(-2),
    },
  });
  await osms.purchaseOrderLine.update({
    where: { id: poD.lines[0].id },
    data: {
      correctedQuantity: 20,
      correctedReason: "AUTO_MATCH",
      correctedAt: day(-2),
      correctedByName: "System (auto-match)",
    },
  });

  for (const [soLine, quantity] of [
    [soD1.lines[0], 12],
    [soD2.lines[0], 8],
  ] as const) {
    await osms.soPoRecon.create({
      data: {
        soLineId: soLine.id,
        poLineId: poD.lines[0].id,
        productId: kingCrab.id,
        soQuantity: quantity,
        confirmedQuantity: quantity,
        diff: 0,
        diffPct: 0,
        diffStatus: "match",
        status: "completed",
        decision: "keep_so",
        reviewedByName: "System (auto-match)",
        reviewedAt: day(-2),
      },
    });
  }

  // Flow §6.2 → §7 — the warehouse has weighed ten crab legs; each one weighs
  // something different, so the line is parked waiting for SALES to decide
  // which piece goes to which customer. This is the case the Item picks screen
  // opens on.
  const allocD = await osms.allocation.create({
    data: {
      allocationNumber: "ALL-2026-0004",
      productId: kingCrab.id,
      poLineId: poD.lines[0].id,
      actualQuantity: 20,
      unit: "KG",
      allocatedQuantity: 20,
      warehouseQuantity: 0,
      unallocatedQuantity: 0,
      status: "completed",
      createdByName: "Ploy (sales)",
      completedByName: "Ploy (sales)",
      completedAt: day(-1),
      lines: {
        create: [
          {
            target: "customer",
            customerId: customerByCode.get("C001")!,
            soLineId: soD1.lines[0].id,
            quantity: 12,
            unit: "KG",
            reason: "Confirmed order",
          },
          {
            target: "customer",
            customerId: customerByCode.get("S001")!,
            soLineId: soD2.lines[0].id,
            quantity: 8,
            unit: "KG",
            reason: "Confirmed order",
          },
        ],
      },
    },
    include: { lines: true },
  });

  const crabWeights = [2.4, 1.9, 2.2, 1.7, 2.6, 1.8, 2.1, 2.3, 1.6, 1.4];
  await osms.receiving.create({
    data: {
      receiptNumber: "GRN-2026-0004",
      poId: poD.id,
      supplierId: supplierByCode.get("OCEANTH")!,
      receivedDate: day(-1),
      status: "received",
      receivedByName: "Chai (warehouse)",
      notes: "Weighed piece by piece — waiting for sales to place them.",
      lines: {
        create: [
          {
            poLineId: poD.lines[0].id,
            productId: kingCrab.id,
            expectedQuantity: 20,
            actualQuantity: round(crabWeights.reduce((sum, w) => sum + w, 0)),
            unit: "KG",
            lotNumber: "L2608-KC",
            expiryDate: day(28),
            storageLocation: "FRZ-B1",
            status: "received",
            // The warehouse weighed; sales has not placed the pieces yet.
            pickStatus: "awaiting_sales_pick",
            items: {
              create: crabWeights.map((weight, index) => ({
                itemNo: `CRAB-${String(index + 1).padStart(2, "0")}`,
                weight,
                unit: "KG",
                lotNumber: "L2608-KC",
                expiryDate: day(28),
                storageLocation: "FRZ-B1",
                condition: "good",
                receivedAt: day(-1),
                status: "on_hand",
              })),
            },
          },
        ],
      },
    },
  });
  void allocD;

  await osms.exception.create({
    data: {
      code: "EXC-2026-0003",
      type: "WEIGHT_BASED_PRODUCT",
      severity: "medium",
      priority: "medium",
      channelId: channelByCode.get("FS")!,
      ownerName: "Warehouse",
      documentType: "po_line",
      documentId: poD.lines[0].id,
      documentNumber: "PO-2026-0004",
      productId: kingCrab.id,
      description:
        "King crab is weighed piece by piece — each item must be weighed and assigned to a customer on arrival.",
      responsibleDept: "warehouse",
      action: "Weigh every piece at receiving and assign it to a customer.",
      dueDate: day(2),
      status: "open",
      createdByName: "System",
    },
  });

  await osms.notification.createMany({
    data: [
      {
        department: "sales",
        channelId: channelByCode.get("FS")!,
        type: "allocation_pending",
        severity: "info",
        title: "PO-2026-0004: ready to allocate",
        body: "20 KG of king crab confirmed for two customers.",
        documentType: "po",
        documentId: poD.id,
        documentNumber: "PO-2026-0004",
        link: `/osms/sales/allocation?po=${poD.id}`,
      },
      {
        department: "sales",
        channelId: channelByCode.get("FS")!,
        type: "allocation_pending",
        severity: "info",
        title: "PO-2026-0001: ready to allocate",
        body: "24 tins of Kristal 125 g confirmed for Mandarin Oriental.",
        documentType: "po",
        documentId: poA.id,
        documentNumber: "PO-2026-0001",
        link: `/osms/sales/allocation?po=${poA.id}`,
      },
    ],
  });

  // =====================================================================
  // Open demand with no PO at all — the order-management board (§2)
  // =====================================================================
  await osms.purchaseRequest.create({
    data: {
      prNumber: "PR-2026-0106",
      requester: "Nattapong",
      department: "sales",
      requestDate: day(-1),
      status: "open",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: oscietra.id,
            quantity: 12,
            unit: oscietra.unit,
            baseQuantity: 12,
            deliveryDate: day(18),
            status: "PENDING_PO",
          },
          {
            lineNo: 2,
            productId: kingCrab.id,
            quantity: 30,
            unit: "KG",
            baseQuantity: 30,
            deliveryDate: day(18),
            status: "PENDING_PO",
          },
        ],
      },
    },
  });

  await osms.salesOrder.create({
    data: {
      soNumber: "SO-2026-0107",
      channelId: channelByCode.get("CK")!,
      customerId: customerByCode.get("CK001")!,
      orderDate: day(-1),
      deliveryDate: day(20),
      requester: "Nattapong",
      currency: "THB",
      lines: {
        create: [
          {
            lineNo: 1,
            productId: kristal.id,
            quantity: 6,
            unit: kristal.unit,
            baseQuantity: 6,
            unitPrice: 4800,
            priceUnit: kristal.unit,
            currency: "THB",
            deliveryDate: day(20),
            originalQuantity: 6,
            status: "PENDING_PO",
          },
        ],
      },
    },
  });

  // =====================================================================
  // Scenario E — the §45 example: 2,000 KG of salmon ordered across all four
  // channels, 1,700 delivered. The system lays the shortfall out per channel
  // and STOPS: management ranks the channels, the system never does.
  // =====================================================================
  const salmon = productByCode.get("3168");
  if (salmon) {
    const salmonDemand = [
      { so: "SO-2026-0201", channel: "FS", customer: "C001", quantity: 1000, owner: "Ploy" },
      { so: "SO-2026-0202", channel: "RTL", customer: "C010", quantity: 500, owner: "Nattapong" },
      { so: "SO-2026-0203", channel: "STR", customer: "S001", quantity: 300, owner: "Mai" },
      { so: "SO-2026-0204", channel: "CK", customer: "CK001", quantity: 200, owner: "Korn" },
    ];

    const salmonSoLines: { soId: string; lineId: string; entry: (typeof salmonDemand)[number] }[] = [];
    for (const entry of salmonDemand) {
      const so = await osms.salesOrder.create({
        data: {
          soNumber: entry.so,
          channelId: channelByCode.get(entry.channel)!,
          customerId: customerByCode.get(entry.customer)!,
          salesOwner: entry.owner,
          orderDate: day(-14),
          deliveryDate: day(3),
          requester: entry.owner,
          currency: "THB",
          lines: {
            create: [
              {
                lineNo: 1,
                productId: salmon.id,
                quantity: entry.quantity,
                unit: "KG",
                baseQuantity: entry.quantity,
                unitPrice: 1250,
                priceUnit: "KG",
                currency: "THB",
                deliveryDate: day(3),
                originalQuantity: entry.quantity,
                poNumberRef: "PO-2026-0005",
                // FS and RTL are the two channels the shortage case disputes;
                // STR and CK are covered by the second PO and move on.
                status:
                  entry.channel === "FS" || entry.channel === "RTL"
                    ? "EXCEPTION"
                    : "PENDING_ALLOCATION",
              },
            ],
          },
        },
        include: { lines: true },
      });
      salmonSoLines.push({ soId: so.id, lineId: so.lines[0].id, entry });
    }

    // Two POs cover the 2,000 KG — one SO is served by several POs and one PO
    // serves several SOs, which is exactly why the mapping is its own table.
    const poE1 = await osms.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-0005",
        supplierId: supplierByCode.get("NORSEA")!,
        orderDate: day(-12),
        expectedDeliveryDate: day(3),
        currency: "EUR",
        status: "invoiced",
        createdByName: "Anna (purchasing)",
        lines: {
          create: [
            {
              lineNo: 1,
              productId: salmon.id,
              quantity: 1200,
              unit: "KG",
              baseQuantity: 1200,
              unitPrice: 26.5,
              priceUnit: "KG",
              currency: "EUR",
              deliveryDate: day(3),
              requiredQuantity: 1200,
              moq: 100,
              status: "EXCEPTION",
            },
          ],
        },
      },
      include: { lines: true },
    });

    const poE2 = await osms.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-0006",
        supplierId: supplierByCode.get("NORSEA")!,
        orderDate: day(-12),
        expectedDeliveryDate: day(3),
        currency: "EUR",
        status: "invoiced",
        notes: "Second lot — the supplier could not ship 2,000 KG in one go.",
        createdByName: "Anna (purchasing)",
        lines: {
          create: [
            {
              lineNo: 1,
              productId: salmon.id,
              quantity: 900,
              unit: "KG",
              baseQuantity: 900,
              unitPrice: 26.5,
              priceUnit: "KG",
              currency: "EUR",
              deliveryDate: day(3),
              requiredQuantity: 800,
              moq: 100,
              adjustmentReason: "MOQ",
              adjustmentNote: "Rounded to a full 900 KG pallet.",
              status: "PENDING_ALLOCATION",
            },
          ],
        },
      },
      include: { lines: true },
    });

    // PO-0005 carries Food Service (1,000) + 200 of Retail;
    // PO-0006 carries the rest of Retail (300) + Store (300) + CK (200).
    const mapping = [
      { po: poE1, soIndex: 0, quantity: 1000 },
      { po: poE1, soIndex: 1, quantity: 200 },
      { po: poE2, soIndex: 1, quantity: 300 },
      { po: poE2, soIndex: 2, quantity: 300 },
      { po: poE2, soIndex: 3, quantity: 200 },
    ];
    for (const entry of mapping) {
      const target = salmonSoLines[entry.soIndex];
      await osms.soPoMapping.create({
        data: {
          poId: entry.po.id,
          poLineId: entry.po.lines[0].id,
          soLineId: target.lineId,
          soId: target.soId,
          productId: salmon.id,
          quantity: entry.quantity,
          unit: "KG",
          reason:
            entry.soIndex === 1
              ? "Retail order split across both lots"
              : null,
          createdByName: "Anna (purchasing)",
        },
      });
    }

    // Supplier invoiced 1,150 + 550 = 1,700 against 2,100 ordered.
    const invoiceE = await osms.invoice.create({
      data: {
        invoiceNumber: "INV-NOR-20502",
        supplierId: supplierByCode.get("NORSEA")!,
        poId: poE1.id,
        poNumberRaw: "PO-2026-0005",
        supplierNameRaw: "Nordic Seafood A/S",
        invoiceDate: day(-1),
        deliveryDate: day(3),
        currency: "EUR",
        status: "verified",
        fileName: "INV-NOR-20502.pdf",
        extractionMode: "ai",
        uploadedByName: "Anna (purchasing)",
        verifiedByName: "Anna (purchasing)",
        verifiedAt: day(-1),
        lines: {
          create: [
            {
              lineNo: 1,
              productId: salmon.id,
              productCodeRaw: "3168",
              descriptionRaw: "NORWEGIAN SMOKED SALMON IMPERIAL",
              quantity: 1150,
              unit: "KG",
              baseQuantity: 1150,
              unitPrice: 26.5,
              priceUnit: "KG",
              currency: "EUR",
              deliveryDate: day(3),
              poLineId: poE1.lines[0].id,
            },
          ],
        },
      },
      include: { lines: true },
    });

    await osms.poInvoiceRecon.create({
      data: {
        poId: poE1.id,
        poLineId: poE1.lines[0].id,
        invoiceId: invoiceE.id,
        invoiceLineId: invoiceE.lines[0].id,
        productId: salmon.id,
        poQuantity: 1200,
        invoiceQuantity: 1150,
        qtyDiff: -50,
        qtyDiffPct: -4.17,
        poUnitPrice: 26.5,
        invoiceUnitPrice: 26.5,
        priceDiff: 0,
        priceDiffPct: 0,
        qtyStatus: "short",
        priceStatus: "match",
        correctedQuantity: 1150,
        quantityReason: "SUPPLIER_SHORT_SHIPPED",
        remark: "Supplier confirmed 1,150 KG on the truck.",
        status: "approved",
        reviewedByName: "Anna (purchasing)",
        reviewedAt: day(-1),
      },
    });
    await osms.purchaseOrderLine.update({
      where: { id: poE1.lines[0].id },
      data: {
        correctedQuantity: 1150,
        correctedReason: "SUPPLIER_SHORT_SHIPPED",
        correctedAt: day(-1),
        correctedByName: "Anna (purchasing)",
      },
    });

    // The shortage case: 1,150 available against 1,200 of demand spanning
    // Food Service and Retail. Quantities are PROPOSED, never applied.
    const shortageCase = await osms.shortageCase.create({
      data: {
        caseNumber: "SHT-2026-0001",
        productId: salmon.id,
        poLineId: poE1.lines[0].id,
        deliveryDate: day(3),
        actualQuantity: 1150,
        totalSoQuantity: 1200,
        shortageQuantity: 50,
        unit: "KG",
        status: "pending_approval",
        createdByName: "System",
        lines: {
          create: [
            {
              channelId: channelByCode.get("FS")!,
              customerId: customerByCode.get("C001")!,
              soLineId: salmonSoLines[0].lineId,
              requestedQuantity: 1000,
              approvedQuantity: null,
              priority: 10,
            },
            {
              channelId: channelByCode.get("RTL")!,
              customerId: customerByCode.get("C010")!,
              soLineId: salmonSoLines[1].lineId,
              requestedQuantity: 200,
              approvedQuantity: null,
              priority: 20,
            },
          ],
        },
      },
    });

    await osms.exception.create({
      data: {
        code: "EXC-2026-0004",
        type: "SUPPLIER_SHORT",
        severity: "high",
        priority: "critical",
        documentType: "shortage_case",
        documentId: shortageCase.id,
        documentNumber: "SHT-2026-0001",
        productId: salmon.id,
        description:
          "SHT-2026-0001: 1,150 KG available against demand from Food Service and Retail — management must rank the channels.",
        responsibleDept: "management",
        ownerName: "Management",
        action: "Approve the cross-channel split before allocation can start.",
        dueDate: day(2),
        status: "open",
        createdByName: "System",
      },
    });

    await osms.notification.create({
      data: {
        department: "management",
        type: "cross_channel_shortage",
        severity: "critical",
        title: "SHT-2026-0001: cross-channel shortage needs a decision",
        body: "PO-2026-0005 — 1,150 KG available, demand spans Food Service and Retail.",
        documentType: "shortage_case",
        documentId: shortageCase.id,
        documentNumber: "SHT-2026-0001",
        link: `/osms/sales/shortage/${shortageCase.id}`,
      },
    });

    // PO-0006 arrived complete and is already allocated — it also carries a
    // 100 KG leftover from the pallet rounding, booked as warehouse stock.
    const invoiceE2 = await osms.invoice.create({
      data: {
        invoiceNumber: "INV-NOR-20503",
        supplierId: supplierByCode.get("NORSEA")!,
        poId: poE2.id,
        poNumberRaw: "PO-2026-0006",
        supplierNameRaw: "Nordic Seafood A/S",
        invoiceDate: day(-1),
        deliveryDate: day(3),
        currency: "EUR",
        status: "verified",
        fileName: "INV-NOR-20503.pdf",
        extractionMode: "ai",
        uploadedByName: "Anna (purchasing)",
        verifiedByName: "Anna (purchasing)",
        verifiedAt: day(-1),
        lines: {
          create: [
            {
              lineNo: 1,
              productId: salmon.id,
              productCodeRaw: "3168",
              descriptionRaw: "NORWEGIAN SMOKED SALMON IMPERIAL",
              quantity: 900,
              unit: "KG",
              baseQuantity: 900,
              unitPrice: 26.5,
              priceUnit: "KG",
              currency: "EUR",
              deliveryDate: day(3),
              poLineId: poE2.lines[0].id,
            },
          ],
        },
      },
      include: { lines: true },
    });

    await osms.poInvoiceRecon.create({
      data: {
        poId: poE2.id,
        poLineId: poE2.lines[0].id,
        invoiceId: invoiceE2.id,
        invoiceLineId: invoiceE2.lines[0].id,
        productId: salmon.id,
        poQuantity: 900,
        invoiceQuantity: 900,
        qtyDiff: 0,
        qtyDiffPct: 0,
        poUnitPrice: 26.5,
        invoiceUnitPrice: 26.5,
        priceDiff: 0,
        priceDiffPct: 0,
        qtyStatus: "match",
        priceStatus: "match",
        correctedQuantity: 900,
        status: "approved",
        reviewedByName: "System (auto-match)",
        reviewedAt: day(-1),
      },
    });
    await osms.purchaseOrderLine.update({
      where: { id: poE2.lines[0].id },
      data: {
        correctedQuantity: 900,
        correctedReason: "AUTO_MATCH",
        correctedAt: day(-1),
        correctedByName: "System (auto-match)",
      },
    });

    for (const index of [1, 2, 3]) {
      const target = salmonSoLines[index];
      const quantity = index === 1 ? 300 : index === 2 ? 300 : 200;
      await osms.soPoRecon.create({
        data: {
          soLineId: target.lineId,
          poLineId: poE2.lines[0].id,
          productId: salmon.id,
          soQuantity: target.entry.quantity,
          confirmedQuantity: quantity,
          diff: 0,
          diffPct: 0,
          diffStatus: "match",
          status: "completed",
          decision: "keep_so",
          reviewedByName: "System (auto-match)",
          reviewedAt: day(-1),
        },
      });
    }

    // 100 KG left after the three customers were served — into stock, with
    // the chain that produced it (§24).
    const stock = await osms.warehouseStock.create({
      data: {
        stockNumber: "STK-2026-0001",
        productId: salmon.id,
        quantity: 100,
        unit: "KG",
        supplierId: supplierByCode.get("NORSEA")!,
        poId: poE2.id,
        invoiceId: invoiceE2.id,
        originalSoLineId: salmonSoLines[1].lineId,
        channelId: channelByCode.get("RTL")!,
        reason: "Pallet rounding on PO-2026-0006 (MOQ)",
        location: "FRZ-02",
        lotNumber: "SAL-2026-11",
        expiryDate: day(45),
        status: "on_hand",
        createdByName: "Warehouse",
      },
    });
    await osms.warehouseStockTransaction.create({
      data: {
        stockId: stock.id,
        type: "in",
        quantity: 100,
        balanceAfter: 100,
        reason: "Leftover after customer allocation",
        byName: "Warehouse",
      },
    });

    await osms.exception.create({
      data: {
        code: "EXC-2026-0005",
        type: "EXCESS_STOCK",
        severity: "low",
        priority: "low",
        documentType: "warehouse_stock",
        documentId: stock.id,
        documentNumber: "STK-2026-0001",
        productId: salmon.id,
        channelId: channelByCode.get("RTL")!,
        description: "100 KG of smoked salmon in FRZ-02 after the pallet rounding.",
        reason: "MOQ",
        responsibleDept: "sales",
        ownerName: "Nattapong",
        action: "Plan how the leftover is sold before it expires.",
        dueDate: day(20),
        status: "open",
        createdByName: "System",
      },
    });
  }

  // Flow §4 — every reconciliation carries the deadline it inherits from its
  // PO line. Derived in one pass here for the same reason the workflow derives
  // it rather than storing a typed date: there is one definition of "due".
  console.log("Deriving reconciliation deadlines…");
  const reconRows = await osms.poInvoiceRecon.findMany({
    include: { poLine: { select: { deliveryDate: true } } },
  });
  for (const row of reconRows) {
    const delivery = row.poLine.deliveryDate;
    const due = new Date(delivery);
    due.setUTCDate(due.getUTCDate() - 2); // SLA_LEAD_DAYS.poInvoiceReconciliation
    const daysOut = Math.round(
      (Date.UTC(
        delivery.getUTCFullYear(),
        delivery.getUTCMonth(),
        delivery.getUTCDate()
      ) -
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate()
        )) /
        86_400_000
    );
    await osms.poInvoiceRecon.update({
      where: { id: row.id },
      data: {
        deliveryDate: delivery,
        dueDate: due,
        priority:
          daysOut <= 0
            ? "critical"
            : daysOut <= 1
              ? "high"
              : daysOut <= 3
                ? "medium"
                : "low",
      },
    });
  }

  console.log("Writing the sample audit trail…");
  for (const entry of audit) {
    await osms.auditLog.create({ data: entry });
  }

  console.log("Supply-chain sample data:", {
    channels: await osms.businessChannel.count(),
    suppliers: await osms.supplier.count(),
    customers: await osms.customer.count(),
    salesOrders: await osms.salesOrder.count(),
    purchaseOrders: await osms.purchaseOrder.count(),
    soPoMappings: await osms.soPoMapping.count(),
    invoices: await osms.invoice.count(),
    shortageCases: await osms.shortageCase.count(),
    warehouseStock: await osms.warehouseStock.count(),
    exceptions: await osms.exception.count(),
  });
}

// Runnable on its own — OSMS has its own database and its own seed:
//   npm run osms:seed
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const client = new PrismaClient();
  seedSupplyChain(client)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => client.$disconnect());
}
