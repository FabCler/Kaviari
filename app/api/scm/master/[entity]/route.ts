import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, isResponse } from "@/lib/scm/guard";
import { auditEvent, diffFields, recordAudit } from "@/lib/scm/audit";
import { conversionKey, normalizeUnit } from "@/lib/scm/units";

export const dynamic = "force-dynamic";

/**
 * §11 — master data. One handler for suppliers, customers, units, unit
 * conversions and the supply-chain fields on the product master, because the
 * shape is identical: validate, upsert, audit.
 */

const ENTITIES = [
  "suppliers",
  "customers",
  "units",
  "conversions",
  "products",
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
  deliveryLocation: z.string().max(300).nullable().optional(),
  salesOwner: z.string().max(120).nullable().optional(),
  contactEmail: z.string().max(200).nullable().optional(),
  contactPhone: z.string().max(60).nullable().optional(),
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
        ? await prisma.supplier.findUnique({ where: { id } })
        : await prisma.supplier.findUnique({ where: { code } });
      const saved = existing
        ? await prisma.supplier.update({
            where: { id: existing.id },
            data: { ...data, code },
          })
        : await prisma.supplier.create({ data: { ...data, code } });
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
        ? await prisma.customer.findUnique({ where: { id } })
        : await prisma.customer.findUnique({ where: { code } });
      const saved = existing
        ? await prisma.customer.update({
            where: { id: existing.id },
            data: { ...data, code },
          })
        : await prisma.customer.create({ data: { ...data, code } });
      await recordAudit(
        { entity: "customer", entityId: saved.id, documentNumber: code, actor },
        existing
          ? diffFields(existing as never, { ...data, code } as never, [
              "name",
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
      const saved = await prisma.scmUnit.upsert({
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
      const saved = await prisma.scmUnitConversion.upsert({
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

    case "products": {
      const parsed = productSchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json({ error: "Invalid product." }, { status: 400 });
      }
      const { id, ...data } = parsed.data;
      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) {
        return Response.json({ error: "Product not found." }, { status: 404 });
      }
      const normalized = {
        ...data,
        purchaseUnit: data.purchaseUnit ? normalizeUnit(data.purchaseUnit) : data.purchaseUnit,
      };
      await prisma.product.update({ where: { id }, data: normalized });
      await recordAudit(
        {
          entity: "product",
          entityId: id,
          documentNumber: existing.prCode,
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
    await prisma.supplier.update({ where: { id }, data: { active: false } });
  } else if (entity === "customers") {
    await prisma.customer.update({ where: { id }, data: { active: false } });
  } else if (entity === "conversions") {
    await prisma.scmUnitConversion.delete({ where: { id } });
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
