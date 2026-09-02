"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSection, requireUser } from "@/lib/auth";
import { canResolve } from "@/lib/permissions";
import { record } from "@/lib/audit";
import { ROOT_CAUSES } from "@/lib/domain";
import { norm } from "@/lib/format";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * A desk confirms it has dealt with its exception. Only the desk that owns the
 * issue may tick it (an administrator may act for any desk), and who ticked it
 * is recorded — this is the paperwork that lets goods into the warehouse.
 */
export async function toggleResolution(
  shipmentId: string,
  supplierCode: string,
  itemKey: string,
  issueType: string,
  issueOwner: string
): Promise<Result> {
  const user = await requireSection("validation");
  if (!canResolve(user, issueOwner))
    return {
      ok: false,
      error: `Only ${issueOwner} can confirm this one.`,
    };

  const where = {
    shipmentId_supplierCode_itemKey_issueType: {
      shipmentId,
      supplierCode: norm(supplierCode),
      itemKey: norm(itemKey),
      issueType,
    },
  };
  const existing = await prisma.resolution.findUnique({ where });
  if (existing) {
    await prisma.resolution.delete({ where });
    await record(user.id, "resolution.clear", issueType, `${supplierCode} ${itemKey}`);
  } else {
    await prisma.resolution.create({
      data: {
        shipmentId,
        supplierCode: norm(supplierCode),
        itemKey: norm(itemKey),
        issueType,
        resolvedById: user.id,
      },
    });
    await record(user.id, "resolution.confirm", issueType, `${supplierCode} ${itemKey}`);
  }
  revalidatePath("/validation");
  revalidatePath("/exceptions");
  revalidatePath("/receiving");
  revalidatePath("/");
  return { ok: true };
}

/** Why the supplier shipped something other than what was ordered. */
export async function setRootCause(
  shipmentId: string,
  supplierCode: string,
  itemKey: string,
  cause: string
): Promise<Result> {
  const user = await requireSection("validation");
  if (cause && !ROOT_CAUSES.includes(cause as (typeof ROOT_CAUSES)[number]))
    return { ok: false, error: "Unknown root cause." };
  if (user.department !== "Purchasing" && user.role === "member")
    return { ok: false, error: "Purchasing records the root cause." };

  await upsertLineState(shipmentId, supplierCode, itemKey, { rootCause: cause }, user.id);
  await record(user.id, "rootcause.set", cause, `${supplierCode} ${itemKey}`);
  revalidatePath("/validation");
  revalidatePath("/");
  return { ok: true };
}

export async function upsertLineState(
  shipmentId: string,
  supplierCode: string,
  itemKey: string,
  data: { rootCause?: string; freeStockQty?: number },
  userId: string
) {
  const key = {
    shipmentId,
    supplierCode: norm(supplierCode),
    itemKey: norm(itemKey),
  };
  await prisma.lineState.upsert({
    where: { shipmentId_supplierCode_itemKey: key },
    create: { ...key, ...data, updatedById: userId },
    update: { ...data, updatedById: userId },
  });
}

/** Which supplier on the shipment a customer order is served from. */
export async function assignSoSupplier(
  soLineId: string,
  supplierCode: string
): Promise<Result> {
  const user = await requireUser();
  const line = await prisma.soLine.findUnique({ where: { id: soLineId } });
  if (!line) return { ok: false, error: "That SO line no longer exists." };
  await prisma.soLine.update({
    where: { id: soLineId },
    data: { supplierCode: norm(supplierCode) },
  });
  await record(user.id, "so.assign", line.soNo, supplierCode);
  revalidatePath("/validation");
  revalidatePath("/so-adjustment");
  return { ok: true };
}
