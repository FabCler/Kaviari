import { requireAuth } from "@/lib/auth";
import { getPlannerData } from "@/lib/planner";
import { shortProductName } from "@/lib/format";
import {
  buildStyledWorkbook,
  xlsxResponse,
  INTEGER_FORMAT,
} from "@/lib/po-excel";

export const dynamic = "force-dynamic";

/**
 * Download the CURRENT replenishment suggestions as a styled .xlsx.
 * Quantities are always recomputed server-side — the file contains every
 * product whose suggested order is > 0 (already rounded up to full boxes).
 */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const planner = await getPlannerData();
  const suggested = planner.rows.filter(
    (row) => row.suggestion.suggestedUnits > 0
  );

  const today = new Date().toISOString().slice(0, 10);

  const bytes = await buildStyledWorkbook({
    sheetName: "Order suggestions",
    title: `Kaviari Cellar — Order Suggestions (${today})`,
    columns: [
      { header: "PR Code", width: 12 },
      { header: "Description", width: 42 },
      { header: "Category", width: 16 },
      { header: "Caviar Type", width: 16 },
      { header: "Unit", width: 8 },
      { header: "Packing/box", width: 12, numFmt: INTEGER_FORMAT, align: "right" },
      { header: "Suggested (units)", width: 16, numFmt: INTEGER_FORMAT, align: "right" },
      { header: "Boxes", width: 10, numFmt: INTEGER_FORMAT, align: "right" },
    ],
    rows: suggested.map((row) => [
      row.product.prCode,
      shortProductName(row.product.name),
      row.product.category,
      row.product.caviarType,
      row.product.unit,
      row.product.packingPerBox,
      row.suggestion.suggestedUnits,
      row.suggestion.boxes,
    ]),
    note:
      suggested.length === 0
        ? "No products currently need ordering — every product is at or above its order-up-to level."
        : `Suggested quantities are rounded up to whole units and to full supplier boxes. Policy: review ${planner.settings.reviewPeriodDays} d · lead ${planner.settings.leadTimeDays} d · safety ${planner.settings.safetyStockDays} d.`,
  });

  return xlsxResponse(bytes, `Kaviari_Order_Suggestions_${today}.xlsx`);
}
