import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { roundUpToBox } from "@/lib/replenishment";
import { formatDate, shortProductName } from "@/lib/format";
import {
  buildStyledWorkbook,
  xlsxResponse,
  INTEGER_FORMAT,
} from "@/lib/po-excel";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Download one purchase order as a styled .xlsx. Quantities in the export
 * always equal full supplier boxes when a packing size applies — each line
 * is re-rounded with roundUpToBox, and a note flags any bumped line.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await ctx.params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: { include: { product: true } },
    },
  });
  if (!po) {
    return Response.json({ error: "Purchase order not found" }, { status: 404 });
  }

  let anyBumped = false;
  const rows = po.lines.map((line) => {
    const exportQty = roundUpToBox(line.quantityTins, line.product.packingPerBox);
    if (exportQty > line.quantityTins) anyBumped = true;
    const boxes = line.product.packingPerBox
      ? exportQty / line.product.packingPerBox
      : null;
    return [
      line.product.prCode,
      shortProductName(line.product.name),
      line.product.caviarType,
      line.product.unit,
      line.product.packingPerBox,
      exportQty,
      boxes,
    ] as (string | number | null)[];
  });

  const meta: [string, string][] = [
    ["Reference", po.reference],
    ["Status", po.status],
    ["Order date", formatDate(po.orderDate)],
    ["Expected delivery", formatDate(po.expectedDeliveryDate)],
  ];
  if (po.receivedDate) meta.push(["Received", formatDate(po.receivedDate)]);
  if (po.uploadedFileName) meta.push(["Source file", po.uploadedFileName]);

  const bytes = await buildStyledWorkbook({
    sheetName: "Purchase order",
    title: `Kaviari Cellar — Purchase Order ${po.reference}`,
    meta,
    columns: [
      { header: "PR Code", width: 12 },
      { header: "Description", width: 42 },
      { header: "Caviar Type", width: 16 },
      { header: "Unit", width: 8 },
      { header: "Packing/box", width: 12, numFmt: INTEGER_FORMAT, align: "right" },
      { header: "Quantity (units)", width: 16, numFmt: INTEGER_FORMAT, align: "right" },
      { header: "Boxes", width: 10, numFmt: INTEGER_FORMAT, align: "right" },
    ],
    rows,
    note: anyBumped
      ? "Quantities rounded up to full boxes"
      : undefined,
  });

  return xlsxResponse(bytes, `PO_${po.reference}.xlsx`);
}
