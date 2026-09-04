import { z } from "zod";
import { osms } from "@/lib/osms/db";
import { requirePermission, isResponse } from "@/lib/osms/guard";
import { auditEvent, diffFields, recordAudit } from "@/lib/osms/audit";
import { conversionKey, normalizeUnit } from "@/lib/osms/units";
import { toleranceKey } from "@/lib/osms/tolerance";

export const dynamic = "force-dynamic";

/**
 * §11 — master data. One handler for suppliers, customers, units, unit
 * conversions and the purchasing fields on the product master, because the
 * shape is identical: validate, upsert, audit.
 */

const ENTITIES = [
  "suppliers",
  "customers",
  "units",
  "conversions",
  "products",
  "channels",
  "tolerances",
] as const;
type Entity = (typeof ENTITIES)[number];

const supplierSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  currency: z.string().max(8).default("EUR"),
  defaultUnit: z.string().max(16).default("KG"),
  moq: z.number().min(0).nullable().optional(),
  leadTimeDays: z.number().int().min(0).nullable().optional(),
  contactEmail: z.string().max(200).nullable().optional(),
  contactPhone: z.string().max(60).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  active: z.boolean().default(true),
});

const customerSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  nameTh: z.string().max(200).nullable().optional(),
  channelId: z.string().nullable().optional(),
  deliveryLocation: z.string().max(300).nullable().optional(),
  salesOwner: z.string().max(120).nullable().optional(),
  contactEmail: z.string().max(200).nullable().optional(),
  contactPhone: z.string().max(60).nullable().optional(),
  active: z.boolean().default(true),
});

const channelSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(16),
  name: z.string().min(1).max(120),
  nameTh: z.string().max(120).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  defaultPriority: z.number().int().min(0).max(999).default(100),
  active: z.boolean().default(true),
});

const toleranceSchema = z.object({
  id: z.string().optional(),
  scope: z.enum(["global", "product_type", "supplier", "channel"]),
  productType: z.string().max(60).nullable().optional(),
  supplierId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
  qtyTolerancePct: z.number().min(0).max(100).default(0),
  priceTolerancePct: z.number().min(0).max(100).default(0),
  weightTolerancePct: z.number().min(0).max(100).default(0),
  note: z.string().max(300).nullable().optional(),
  active: z.boolean().default(true),
});

const unitSchema = z.object({
  code: z.string().min(1).max(16),
  name: z.string().min(1).max(60),
  dimension: z.enum(["weight", "count", "volume"]).default("count"),
  active: z.boolean().default(true),
});

const conversionSchema = z.object({
  id: z.string().optional(),
  productId: z.string().nullable().optional(),
  fromUnit: z.string().min(1).max(16),
  toUnit: z.string().min(1).max(16),
  factor: z.number().positive(),
});

const productSchema = z.object({
  id: z.string().min(1),
  nameTh: z.string().max(200).nullable().optional(),
  purchaseUnit: z.string().max(16).nullable().optional(),
  purchaseConversion: z.number().positive().nullable().optional(),
  moq: z.number().min(0).nullable().optional(),
  defaultSupplierId: z.string().nullable().optional(),
  weightControlled: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const actor = await requirePermission("master.manage");
  if (isResponse(actor)) return actor;

  const { entity } = await params;
  if (!ENTITIES.includes(entity as Entity)) {
    return Response.json({ error: `Unknown master "${entity}".` }, { status: 404 });
  }
  const raw = await request.json().catch(() => ({}));

  switch (entity as Entity) {
    case "suppliers": {
      const parsed = supplierSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid supplier." },
          { status: 400 }
        );
      }
      const { id, ...data } = parsed.data;
      const code = data.code.trim().toUpperCase();
      const existing = id
        ? await osms.supplier.findUnique({ where: { id } })
        : await osms.supplier.findUnique({ where: { code } });
      const saved = existing
        ? await osms.supplier.update({
            where: { id: existing.id },
            data: { ...data, code },
          })
        : await osms.supplier.create({ data: { ...data, code } });
      await recordAudit(
        { entity: "supplier", entityId: saved.id, documentNumber: code, actor },
        existing
          ? diffFields(existing as never, { ...data, code } as never, [
              "name",
              "currency",
              "defaultUnit",
              "moq",
              "leadTimeDays",
              "active",
            ])
          : [{ action: "create", field: "code", newValue: code }]
      );
      return Response.json({ id: saved.id, code: saved.code });
    }

    case "customers": {
      const parsed = customerSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid customer." },
          { status: 400 }
        );
      }
      const { id, ...data } = parsed.data;
      const code = data.code.trim().toUpperCase();
      const existing = id
        ? await osms.customer.findUnique({ where: { id } })
        : await osms.customer.findUnique({ where: { code } });
      const saved = existing
        ? await osms.customer.update({
            where: { id: existing.id },
            data: { ...data, code },
          })
        : await osms.customer.create({ data: { ...data, code } });
      await recordAudit(
        { entity: "customer", entityId: saved.id, documentNumber: code, actor },
        existing
          ? diffFields(existing as never, { ...data, code } as never, [
              "name",
              "channelId",
              "deliveryLocation",
              "salesOwner",
              "active",
            ])
          : [{ action: "create", field: "code", newValue: code }]
      );
      return Response.json({ id: saved.id, code: saved.code });
    }

    case "units": {
      const parsed = unitSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json({ error: "Invalid unit." }, { status: 400 });
      }
      const code = normalizeUnit(parsed.data.code);
      const saved = await osms.unit.upsert({
        where: { code },
        create: { ...parsed.data, code },
        update: { ...parsed.data, code },
      });
      await auditEvent(
        { entity: "unit", entityId: saved.code, documentNumber: code, actor },
        "update",
        { field: "unit", newValue: `${code} (${parsed.data.dimension})` }
      );
      return Response.json({ code: saved.code });
    }

    case "conversions": {
      const parsed = conversionSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid conversion — the factor must be greater than zero." },
          { status: 400 }
        );
      }
      const fromUnit = normalizeUnit(parsed.data.fromUnit);
      const toUnit = normalizeUnit(parsed.data.toUnit);
      if (fromUnit === toUnit) {
        return Response.json(
          { error: "A unit cannot convert to itself." },
          { status: 422 }
        );
      }
      const productId = parsed.data.productId ?? null;
      const key = conversionKey(productId, fromUnit, toUnit);
      const saved = await osms.unitConversion.upsert({
        where: { key },
        create: { key, productId, fromUnit, toUnit, factor: parsed.data.factor },
        update: { factor: parsed.data.factor },
      });
      await auditEvent(
        { entity: "unit_conversion", entityId: saved.id, documentNumber: key, actor },
        "update",
        {
          field: "factor",
          newValue: `1 ${fromUnit} = ${parsed.data.factor} ${toUnit}`,
        }
      );
      return Response.json({ id: saved.id, key });
    }

    case "channels": {
      const parsed = channelSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid channel." },
          { status: 400 }
        );
      }
      const { id, ...data } = parsed.data;
      const code = data.code.trim().toUpperCase();
      const existing = id
        ? await osms.businessChannel.findUnique({ where: { id } })
        : await osms.businessChannel.findUnique({ where: { code } });
      const saved = existing
        ? await osms.businessChannel.update({
            where: { id: existing.id },
            data: { ...data, code },
          })
        : await osms.businessChannel.create({ data: { ...data, code } });
      await recordAudit(
        { entity: "business_channel", entityId: saved.id, documentNumber: code, actor },
        existing
          ? diffFields(existing as never, { ...data, code } as never, [
              "name",
              "nameTh",
              "sortOrder",
              "defaultPriority",
              "active",
            ])
          : [
              {
                action: "create",
                field: "code",
                newValue: code,
                oldValue: null,
              },
            ]
      );
      return Response.json({ id: saved.id, code: saved.code });
    }

    case "tolerances": {
      const parsed = toleranceSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json({ error: "Invalid tolerance rule." }, { status: 400 });
      }
      const data = parsed.data;
      const target =
        data.scope === "supplier"
          ? data.supplierId
          : data.scope === "channel"
            ? data.channelId
            : data.scope === "product_type"
              ? data.productType
              : null;
      if (data.scope !== "global" && !target) {
        return Response.json(
          { error: `A ${data.scope.replace("_", " ")} must be chosen for this rule.` },
          { status: 422 }
        );
      }
      const key = toleranceKey(data.scope, target);
      const saved = await osms.tolerance.upsert({
        where: { key },
        create: {
          key,
          scope: data.scope,
          productType: data.scope === "product_type" ? data.productType : null,
          supplierId: data.scope === "supplier" ? data.supplierId : null,
          channelId: data.scope === "channel" ? data.channelId : null,
          qtyTolerancePct: data.qtyTolerancePct,
          priceTolerancePct: data.priceTolerancePct,
          weightTolerancePct: data.weightTolerancePct,
          note: data.note ?? null,
          active: data.active,
        },
        update: {
          qtyTolerancePct: data.qtyTolerancePct,
          priceTolerancePct: data.priceTolerancePct,
          weightTolerancePct: data.weightTolerancePct,
          note: data.note ?? null,
          active: data.active,
        },
      });
      await auditEvent(
        { entity: "tolerance", entityId: saved.id, documentNumber: key, actor },
        "update",
        {
          field: "tolerance",
          newValue: `qty ${data.qtyTolerancePct}% · price ${data.priceTolerancePct}% · weight ${data.weightTolerancePct}%`,
        }
      );
      return Response.json({ id: saved.id, key });
    }

    case "products": {
      const parsed = productSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json({ error: "Invalid product." }, { status: 400 });
      }
      const { id, ...data } = parsed.data;
      const existing = await osms.product.findUnique({ where: { id } });
      if (!existing) {
        return Response.json({ error: "Product not found." }, { status: 404 });
      }
      const normalized = {
        ...data,
        purchaseUnit: data.purchaseUnit ? normalizeUnit(data.purchaseUnit) : data.purchaseUnit,
      };
      await osms.product.update({ where: { id }, data: normalized });
      await recordAudit(
        {
          entity: "product",
          entityId: id,
          documentNumber: existing.code,
          actor,
        },
        diffFields(existing as never, normalized as never, [
          "nameTh",
          "purchaseUnit",
          "purchaseConversion",
          "moq",
          "defaultSupplierId",
          "weightControlled",
        ])
      );
      return Response.json({ id });
    }
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const actor = await requirePermission("master.manage");
  if (isResponse(actor)) return actor;

  const { entity } = await params;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "An id is required." }, { status: 400 });

  // Master records are deactivated, never deleted: history must keep
  // resolving (§12 — no data is ever removed).
  if (entity === "suppliers") {
    await osms.supplier.update({ where: { id }, data: { active: false } });
  } else if (entity === "customers") {
    await osms.customer.update({ where: { id }, data: { active: false } });
  } else if (entity === "conversions") {
    await osms.unitConversion.delete({ where: { id } });
  } else if (entity === "channels") {
    // A channel is never deleted: past orders, stock and permissions still
    // point at it. Deactivating hides it from the pickers instead.
    await osms.businessChannel.update({ where: { id }, data: { active: false } });
  } else if (entity === "tolerances") {
    await osms.tolerance.update({ where: { id }, data: { active: false } });
  } else {
    return Response.json({ error: `Cannot deactivate "${entity}".` }, { status: 400 });
  }

  await auditEvent(
    { entity: entity.replace(/s$/, ""), entityId: id, actor },
    entity === "conversions" ? "delete" : "update",
    { field: "active", oldValue: true, newValue: false }
  );
  return Response.json({ ok: true });
}
