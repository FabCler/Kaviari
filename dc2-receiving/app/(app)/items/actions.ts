"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { record } from "@/lib/audit";
import { mapItems, mapLinks } from "@/lib/import/columns";
import { readMatrix } from "@/lib/import/read";
import { keyOf, norm } from "@/lib/format";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const itemSchema = z.object({
  barcode: z.string().min(1).max(60),
  itemCode: z.string().max(60),
  nameTh: z.string().max(200),
  nameEn: z.string().max(200),
  uom: z.string().max(20),
});

export async function saveItem(id: string | null, formData: FormData): Promise<Result> {
  const user = await requireSection("items");
  const parsed = itemSchema.safeParse({
    barcode: norm(formData.get("barcode")),
    itemCode: norm(formData.get("itemCode")),
    nameTh: norm(formData.get("nameTh")),
    nameEn: norm(formData.get("nameEn")),
    uom: norm(formData.get("uom")) || "KG",
  });
  if (!parsed.success) return { ok: false, error: "CodeBars is required." };

  const clash = await prisma.item.findFirst({
    where: { barcode: parsed.data.barcode, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) return { ok: false, error: "That CodeBars is already in the master." };

  if (id) await prisma.item.update({ where: { id }, data: parsed.data });
  else await prisma.item.create({ data: parsed.data });
  await record(user.id, id ? "item.update" : "item.create", parsed.data.barcode);
  revalidatePath("/items");
  return { ok: true };
}

export async function deleteItem(id: string): Promise<Result> {
  const user = await requireSection("items");
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return { ok: false, error: "That item no longer exists." };
  await prisma.item.delete({ where: { id } });
  await record(user.id, "item.delete", item.barcode);
  revalidatePath("/items");
  return { ok: true };
}

const linkSchema = z.object({
  supplierCode: z.string().max(60),
  supplierItemCode: z.string().max(120),
  supplierItemName: z.string().max(200),
  supplierUom: z.string().max(20),
  itemRef: z.string().min(1).max(60),
});

export async function saveLink(id: string | null, formData: FormData): Promise<Result> {
  const user = await requireSection("items");
  const parsed = linkSchema.safeParse({
    supplierCode: norm(formData.get("supplierCode")),
    supplierItemCode: norm(formData.get("supplierItemCode")),
    supplierItemName: norm(formData.get("supplierItemName")),
    supplierUom: norm(formData.get("supplierUom")),
    itemRef: norm(formData.get("itemRef")),
  });
  if (!parsed.success)
    return { ok: false, error: "Name the master item this supplier code maps to." };
  if (!parsed.data.supplierItemCode && !parsed.data.supplierItemName)
    return {
      ok: false,
      error: "Give the supplier's own item code or the product name it prints.",
    };

  const item = await findItem(parsed.data.itemRef);
  if (!item)
    return {
      ok: false,
      error: `${parsed.data.itemRef} is not in the Item Master yet — add the item first.`,
    };

  const data = {
    supplierCode: parsed.data.supplierCode,
    supplierItemCode: parsed.data.supplierItemCode,
    supplierItemName: parsed.data.supplierItemName,
    supplierUom: parsed.data.supplierUom,
    itemId: item.id,
  };
  if (id) await prisma.supplierLink.update({ where: { id }, data });
  else await prisma.supplierLink.create({ data });
  await record(user.id, id ? "link.update" : "link.create", item.barcode);
  revalidatePath("/items");
  return { ok: true };
}

export async function deleteLink(id: string): Promise<Result> {
  const user = await requireSection("items");
  await prisma.supplierLink.delete({ where: { id } }).catch(() => null);
  await record(user.id, "link.delete", id);
  revalidatePath("/items");
  return { ok: true };
}

async function findItem(ref: string) {
  const key = keyOf(ref);
  const items = await prisma.item.findMany({
    where: { OR: [{ barcode: ref }, { itemCode: ref }] },
    take: 5,
  });
  return items.find((i) => keyOf(i.barcode) === key || keyOf(i.itemCode) === key) ?? null;
}

/** The master list and the supplier mapping, straight from Excel. */
export async function importMaster(formData: FormData): Promise<Result> {
  const user = await requireSection("items");
  const kind = String(formData.get("kind") ?? "item");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size)
    return { ok: false, error: "Choose a file to import." };
  if (file.size > 15 * 1024 * 1024)
    return { ok: false, error: "That file is larger than 15 MB." };

  let matrix;
  try {
    matrix = readMatrix(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "That file could not be read.",
    };
  }

  if (kind === "item") {
    const rows = mapItems(matrix);
    if (!rows.length)
      return {
        ok: false,
        error:
          "No usable rows. The header row needs CodeBars (or Item Code) and a name.",
      };
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const existing = await prisma.item.findUnique({ where: { barcode: r.barcode } });
      if (existing) {
        await prisma.item.update({ where: { id: existing.id }, data: r });
        updated += 1;
      } else {
        await prisma.item.create({ data: r });
        added += 1;
      }
    }
    await record(user.id, "item.import", file.name, `${added} added, ${updated} updated`);
    revalidatePath("/items");
    return { ok: true, message: `${added} items added, ${updated} updated.` };
  }

  const rows = mapLinks(matrix);
  if (!rows.length)
    return {
      ok: false,
      error:
        "No usable rows. The header row needs the supplier's item code or name plus CodeBars.",
    };
  let added = 0;
  let skipped = 0;
  for (const r of rows) {
    const item = await findItem(r.itemRef);
    if (!item) {
      skipped += 1;
      continue;
    }
    await prisma.supplierLink.upsert({
      where: {
        supplierCode_supplierItemCode_supplierItemName: {
          supplierCode: r.supplierCode,
          supplierItemCode: r.supplierItemCode,
          supplierItemName: r.supplierItemName,
        },
      },
      create: {
        supplierCode: r.supplierCode,
        supplierItemCode: r.supplierItemCode,
        supplierItemName: r.supplierItemName,
        supplierUom: r.supplierUom,
        itemId: item.id,
      },
      update: { supplierUom: r.supplierUom, itemId: item.id },
    });
    added += 1;
  }
  await record(user.id, "link.import", file.name, `${added} links, ${skipped} skipped`);
  revalidatePath("/items");
  return {
    ok: true,
    message: `${added} supplier links saved${skipped ? `, ${skipped} skipped — their item is not in the master yet` : ""}.`,
  };
}
