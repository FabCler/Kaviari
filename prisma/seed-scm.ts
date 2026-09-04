/**
 * Sample data for the supply-chain module.
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
 * User accounts are never touched. Everything else under the module is
 * wiped and rebuilt so the sample stays reproducible.
 */
import type { PrismaClient } from "@prisma/client";

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
    code: "KAV",
    name: "Kaviari Paris",
    currency: "EUR",
    defaultUnit: "TIN",
    moq: null as number | null,
    leadTimeDays: 21,
    contactEmail: "orders@kaviari.fr",
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
    name: "Kaviari Store Bangkok",
    nameTh: "ร้านคาเวียรี กรุงเทพ",
    channel: "STR",
    deliveryLocation: "Bangkok — Sukhumvit 39",
    salesOwner: "Mai",
  },
  {
    code: "S002",
    name: "Kaviari Store Phuket",
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
    prCode: "3193",
    nameTh: "คาเวียร์ คริสตัล 125 กรัม",
    purchaseUnit: "BOX",
    purchaseConversion: 12,
    moq: 2,
    supplier: "KAV",
    weightControlled: false,
  },
  {
    prCode: "3134",
    nameTh: "คาเวียร์ ออเซตร้า เพรสทีจ 125 กรัม",
    purchaseUnit: "BOX",
    purchaseConversion: 12,
    moq: 2,
    supplier: "KAV",
    weightControlled: false,
  },
  {
    prCode: "1216",
    nameTh: "คาเวียร์ คริสตัล 30 กรัม",
    purchaseUnit: "BOX",
    purchaseConversion: 24,
    moq: 1,
    supplier: "KAV",
    weightControlled: false,
  },
  {
    prCode: "3208",
    nameTh: "ขาปูคิงแครบแช่แข็ง 130 กรัม/ชิ้น",
    purchaseUnit: "KG",
    purchaseConversion: 1,
    moq: 20,
    supplier: "NORSEA",
    weightControlled: true,
  },
  {
    prCode: "3168",
    nameTh: "แซลมอนรมควัน อิมพีเรียล",
    purchaseUnit: "KG",
    purchaseConversion: 1,
    moq: 10,
    supplier: "NORSEA",
    weightControlled: false,
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

export async function seedSupplyChain(prisma: PrismaClient): Promise<void> {
  console.log("Clearing supply-chain data…");
  // Children first — SQLite enforces the foreign keys.
  await prisma.scmWarehouseStockTransaction.deleteMany();
  await prisma.scmWarehouseStock.deleteMany();
  await prisma.scmShortageAllocation.deleteMany();
  await prisma.scmShortageCase.deleteMany();
  await prisma.scmShipmentLine.deleteMany();
  await prisma.scmShipment.deleteMany();
  await prisma.scmReceivingItem.deleteMany();
  await prisma.scmReceivingLine.deleteMany();
  await prisma.scmReceiving.deleteMany();
  await prisma.scmAllocationLine.deleteMany();
  await prisma.scmAllocation.deleteMany();
  await prisma.scmSoPoRecon.deleteMany();
  await prisma.scmPoInvoiceRecon.deleteMany();
  await prisma.scmInvoiceLine.deleteMany();
  await prisma.scmInvoice.deleteMany();
  await prisma.scmSoPoMapping.deleteMany();
  await prisma.scmPurchaseOrderLine.deleteMany();
  await prisma.scmPurchaseOrder.deleteMany();
  await prisma.scmPurchaseRequestLine.deleteMany();
  await prisma.scmPurchaseRequest.deleteMany();
  await prisma.scmSalesOrderLine.deleteMany();
  await prisma.scmSalesOrder.deleteMany();
  await prisma.scmException.deleteMany();
  await prisma.scmNotification.deleteMany();
  await prisma.scmAuditLog.deleteMany();
  await prisma.scmAttachment.deleteMany();
  await prisma.scmImportBatch.deleteMany();
  await prisma.scmUnitConversion.deleteMany();
  await prisma.scmUnit.deleteMany();
  await prisma.scmTolerance.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.scmUserChannel.deleteMany();
  await prisma.businessChannel.deleteMany();
  await prisma.scmDepartment.deleteMany();
  await prisma.scmRole.deleteMany();

  console.log("Seeding business channels, departments and roles…");
  const channelByCode = new Map<string, string>();
  for (const channel of CHANNELS) {
    const created = await prisma.businessChannel.create({ data: channel });
    channelByCode.set(channel.code, created.id);
  }
  for (const department of DEPARTMENTS) {
    await prisma.scmDepartment.create({ data: department });
  }
  for (const role of ROLES) {
    await prisma.scmRole.create({ data: role });
  }

  console.log("Seeding units and conversions…");
  for (const unit of UNITS) {
    await prisma.scmUnit.create({ data: unit });
  }
  for (const conversion of GLOBAL_CONVERSIONS) {
    await prisma.scmUnitConversion.create({
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
    const created = await prisma.supplier.create({ data: supplier });
    supplierByCode.set(supplier.code, created.id);
  }
  const customerByCode = new Map<string, string>();
  for (const customer of CUSTOMERS) {
    const { channel, ...data } = customer;
    const created = await prisma.customer.create({
      data: { ...data, channelId: channelByCode.get(channel) ?? null },
    });
    customerByCode.set(customer.code, created.id);
  }

  console.log("Seeding tolerance rules…");
  // Global default: every difference needs a human. Two exceptions show how
  // the master narrows that down per supplier and per channel (§28).
  await prisma.scmTolerance.createMany({
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

  console.log("Applying supply-chain fields to the product master…");
  const productByCode = new Map<
    string,
    { id: string; unit: string; name: string; unitCost: number }
  >();
  for (const setup of PRODUCT_SETUP) {
    const product = await prisma.product.findUnique({
      where: { prCode: setup.prCode },
    });
    if (!product) {
      console.warn(`  product ${setup.prCode} is not in the catalog — skipped`);
      continue;
    }
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        nameTh: setup.nameTh,
        purchaseUnit: setup.purchaseUnit,
        purchaseConversion: setup.purchaseConversion,
        moq: setup.moq,
        defaultSupplierId: supplierByCode.get(setup.supplier) ?? null,
        weightControlled: setup.weightControlled,
      },
    });
    productByCode.set(setup.prCode, {
      id: updated.id,
      unit: updated.unit,
      name: updated.name,
      // The catalog carries a real cost for caviar and 0 for the rest;
      // give the sample a workable price either way.
      unitCost: updated.unitCost > 0 ? updated.unitCost : 42,
    });
    // Product-specific purchase-unit conversion (1 BOX = 12 tins…).
    if (setup.purchaseUnit && setup.purchaseUnit !== updated.unit) {
      await prisma.scmUnitConversion.create({
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
  const soA = await prisma.scmSalesOrder.create({
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

  const prA = await prisma.scmPurchaseRequest.create({
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

  const poA = await prisma.scmPurchaseOrder.create({
    data: {
      poNumber: "PO-2026-0001",
      supplierId: supplierByCode.get("KAV")!,
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

  await prisma.scmSoPoMapping.create({
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

  const invoiceA = await prisma.scmInvoice.create({
    data: {
      invoiceNumber: "INV-KAV-88012",
      supplierId: supplierByCode.get("KAV")!,
      poId: poA.id,
      poNumberRaw: "PO-2026-0001",
      supplierNameRaw: "Kaviari Paris",
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

  await prisma.scmPoInvoiceRecon.create({
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

  await prisma.scmPurchaseOrderLine.update({
    where: { id: poA.lines[0].id },
    data: {
      correctedQuantity: 24,
      correctedReason: "AUTO_MATCH",
      correctedAt: day(-2),
      correctedByName: "System (auto-match)",
      status: "PENDING_ALLOCATION",
    },
  });

  await prisma.scmSoPoRecon.create({
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
  await prisma.scmSalesOrderLine.update({
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
  const soB = await prisma.scmSalesOrder.create({
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

  const poB = await prisma.scmPurchaseOrder.create({
    data: {
      poNumber: "PO-2026-0002",
      supplierId: supplierByCode.get("KAV")!,
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

  await prisma.scmSoPoMapping.create({
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

  const invoiceB = await prisma.scmInvoice.create({
    data: {
      invoiceNumber: "INV-KAV-88044",
      supplierId: supplierByCode.get("KAV")!,
      poId: poB.id,
      poNumberRaw: "PO-2026-0002",
      supplierNameRaw: "Kaviari Paris",
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
  await prisma.scmPoInvoiceRecon.create({
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

  await prisma.scmException.create({
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

  await prisma.scmNotification.create({
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
      link: `/scm/purchasing/po-invoice?po=${poB.id}`,
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
  const soC = await prisma.scmSalesOrder.create({
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

  const poC = await prisma.scmPurchaseOrder.create({
    data: {
      poNumber: "PO-2026-0003",
      supplierId: supplierByCode.get("KAV")!,
      orderDate: day(-3),
      expectedDeliveryDate: day(12),
      currency: "EUR",
      status: "issued",
      notes: "Rounded up to a full box — Kaviari does not split boxes.",
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

  await prisma.scmSoPoMapping.create({
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

  await prisma.scmException.create({
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
  const soD1 = await prisma.scmSalesOrder.create({
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

  const soD2 = await prisma.scmSalesOrder.create({
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

  const poD = await prisma.scmPurchaseOrder.create({
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

  await prisma.scmSoPoMapping.createMany({
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

  const invoiceD = await prisma.scmInvoice.create({
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

  await prisma.scmPoInvoiceRecon.create({
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
  await prisma.scmPurchaseOrderLine.update({
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
    await prisma.scmSoPoRecon.create({
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

  await prisma.scmException.create({
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

  await prisma.scmNotification.createMany({
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
        link: `/scm/sales/allocation?po=${poD.id}`,
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
        link: `/scm/sales/allocation?po=${poA.id}`,
      },
    ],
  });

  // =====================================================================
  // Open demand with no PO at all — the order-management board (§2)
  // =====================================================================
  await prisma.scmPurchaseRequest.create({
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

  await prisma.scmSalesOrder.create({
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
      const so = await prisma.scmSalesOrder.create({
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
    const poE1 = await prisma.scmPurchaseOrder.create({
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

    const poE2 = await prisma.scmPurchaseOrder.create({
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
      await prisma.scmSoPoMapping.create({
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
    const invoiceE = await prisma.scmInvoice.create({
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

    await prisma.scmPoInvoiceRecon.create({
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
    await prisma.scmPurchaseOrderLine.update({
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
    const shortageCase = await prisma.scmShortageCase.create({
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

    await prisma.scmException.create({
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

    await prisma.scmNotification.create({
      data: {
        department: "management",
        type: "cross_channel_shortage",
        severity: "critical",
        title: "SHT-2026-0001: cross-channel shortage needs a decision",
        body: "PO-2026-0005 — 1,150 KG available, demand spans Food Service and Retail.",
        documentType: "shortage_case",
        documentId: shortageCase.id,
        documentNumber: "SHT-2026-0001",
        link: `/scm/sales/shortage/${shortageCase.id}`,
      },
    });

    // PO-0006 arrived complete and is already allocated — it also carries a
    // 100 KG leftover from the pallet rounding, booked as warehouse stock.
    const invoiceE2 = await prisma.scmInvoice.create({
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

    await prisma.scmPoInvoiceRecon.create({
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
    await prisma.scmPurchaseOrderLine.update({
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
      await prisma.scmSoPoRecon.create({
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
    const stock = await prisma.scmWarehouseStock.create({
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
    await prisma.scmWarehouseStockTransaction.create({
      data: {
        stockId: stock.id,
        type: "in",
        quantity: 100,
        balanceAfter: 100,
        reason: "Leftover after customer allocation",
        byName: "Warehouse",
      },
    });

    await prisma.scmException.create({
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

  console.log("Writing the sample audit trail…");
  for (const entry of audit) {
    await prisma.scmAuditLog.create({ data: entry });
  }

  console.log("Supply-chain sample data:", {
    channels: await prisma.businessChannel.count(),
    suppliers: await prisma.supplier.count(),
    customers: await prisma.customer.count(),
    salesOrders: await prisma.scmSalesOrder.count(),
    purchaseOrders: await prisma.scmPurchaseOrder.count(),
    soPoMappings: await prisma.scmSoPoMapping.count(),
    invoices: await prisma.scmInvoice.count(),
    shortageCases: await prisma.scmShortageCase.count(),
    warehouseStock: await prisma.scmWarehouseStock.count(),
    exceptions: await prisma.scmException.count(),
  });
}
