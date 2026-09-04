import { requireAuth } from "@/lib/auth";
import {
  addHeaderRow,
  addInfoBlock,
  addTitleBlock,
  createWorkbook,
  finishTable,
  NUM_FMT,
  PCT_FMT,
  styleDataRows,
  workbookResponse,
  type ColumnSpec,
} from "@/lib/excel";
import { poVsSo, supplierSummary } from "@/lib/osms/queries";
import { COMPARISON_LABELS, ORDER_ADJUSTMENT_LABELS } from "@/lib/osms/domain";
import { formatDate } from "@/lib/format";
import { osms } from "@/lib/osms/db";

export const dynamic = "force-dynamic";

/**
 * §2.1 / §5 / §17 — Excel exports of the two comparison boards, using the
 * app's branded workbook style so they drop straight into a mail to the
 * supplier or a management pack.
 */

const REPORTS = ["supplier-summary", "po-vs-so", "audit"] as const;
type Report = (typeof REPORTS)[number];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { report } = await params;
  if (!REPORTS.includes(report as Report)) {
    return Response.json({ error: `Unknown report "${report}".` }, { status: 404 });
  }
  const url = new URL(request.url);
  const today = formatDate(new Date());

  if (report === "supplier-summary") {
    const rows = await supplierSummary({
      supplierId: url.searchParams.get("supplier") ?? undefined,
      productId: url.searchParams.get("product") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const columns: ColumnSpec[] = [
      { header: "Supplier", width: 26 },
      { header: "PO", width: 16 },
      { header: "Product code", width: 16 },
      { header: "Product", width: 34 },
      { header: "Unit", width: 8, align: "center" },
      { header: "Required qty", width: 14, align: "right", numFmt: NUM_FMT },
      { header: "Order qty", width: 13, align: "right", numFmt: NUM_FMT },
      { header: "MOQ", width: 10, align: "right", numFmt: NUM_FMT },
      {
        header: "Difference",
        width: 13,
        align: "right",
        numFmt: NUM_FMT,
        redNegative: true,
      },
      { header: "Diff %", width: 10, align: "right", numFmt: PCT_FMT },
      { header: "Reason", width: 24 },
      { header: "Delivery", width: 13, align: "center" },
      { header: "Status", width: 22 },
    ];

    const wb = createWorkbook();
    const ws = wb.addWorksheet("Supplier order summary");
    addTitleBlock(
      ws,
      "Supplier order summary",
      columns.length,
      "Ordered quantity against the demand it covers"
    );
    addInfoBlock(ws, "Report", [
      ["Generated", today],
      ["Lines", String(rows.length)],
    ]);
    const headerRow = addHeaderRow(ws, columns);
    for (const row of rows) {
      ws.addRow([
        row.supplierName,
        row.poNumber,
        row.productCode,
        row.productName,
        row.unit,
        row.requiredQuantity,
        row.orderQuantity,
        row.moq ?? null,
        row.difference,
        row.differencePct ?? null,
        row.reason
          ? (ORDER_ADJUSTMENT_LABELS[
              row.reason as keyof typeof ORDER_ADJUSTMENT_LABELS
            ] ?? row.reason)
          : "-",
        formatDate(row.deliveryDate),
        row.status,
      ]);
    }
    const lastRow = ws.lastRow?.number ?? headerRow;
    styleDataRows(ws, columns, headerRow + 1, lastRow);
    finishTable(ws, headerRow, lastRow, columns.length);
    return workbookResponse(wb, `supplier-order-summary-${today}.xlsx`);
  }

  if (report === "po-vs-so") {
    const rows = await poVsSo();
    const columns: ColumnSpec[] = [
      { header: "Product code", width: 16 },
      { header: "Product", width: 34 },
      { header: "Unit", width: 8, align: "center" },
      { header: "SO qty", width: 12, align: "right", numFmt: NUM_FMT },
      { header: "PO qty", width: 12, align: "right", numFmt: NUM_FMT },
      {
        header: "Difference",
        width: 13,
        align: "right",
        numFmt: NUM_FMT,
        redNegative: true,
      },
      { header: "Diff %", width: 10, align: "right", numFmt: PCT_FMT },
      { header: "Status", width: 12 },
      { header: "Delivery", width: 13, align: "center" },
      { header: "Supplier", width: 24 },
      { header: "SO", width: 22 },
      { header: "PO", width: 22 },
    ];

    const wb = createWorkbook();
    const ws = wb.addWorksheet("PO vs SO");
    addTitleBlock(
      ws,
      "PO vs SO comparison",
      columns.length,
      "Difference = PO qty − SO qty, per product and delivery date"
    );
    addInfoBlock(ws, "Report", [
      ["Generated", today],
      ["Lines", String(rows.length)],
    ]);
    const headerRow = addHeaderRow(ws, columns);
    for (const row of rows) {
      ws.addRow([
        row.productCode,
        row.productName,
        row.unit,
        row.soQuantity,
        row.poQuantity,
        row.difference,
        row.differencePct,
        COMPARISON_LABELS[row.status],
        row.deliveryDate ? formatDate(row.deliveryDate) : "-",
        row.supplierName ?? "-",
        row.soNumbers.join(", ") || "-",
        row.poNumbers.join(", ") || "-",
      ]);
    }
    const lastRow = ws.lastRow?.number ?? headerRow;
    styleDataRows(ws, columns, headerRow + 1, lastRow);
    finishTable(ws, headerRow, lastRow, columns.length);
    return workbookResponse(wb, `po-vs-so-${today}.xlsx`);
  }

  // ---- audit trail --------------------------------------------------------
  const entries = await osms.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const columns: ColumnSpec[] = [
    { header: "When", width: 20 },
    { header: "User", width: 22 },
    { header: "Department", width: 14 },
    { header: "Document", width: 18 },
    { header: "Entity", width: 24 },
    { header: "Action", width: 14 },
    { header: "Field", width: 20 },
    { header: "Old value", width: 24 },
    { header: "New value", width: 24 },
    { header: "Reason", width: 34 },
  ];
  const wb = createWorkbook();
  const ws = wb.addWorksheet("Audit trail");
  addTitleBlock(ws, "Audit trail", columns.length, "Every recorded change, newest first");
  addInfoBlock(ws, "Report", [
    ["Generated", today],
    ["Entries", String(entries.length)],
  ]);
  const headerRow = addHeaderRow(ws, columns);
  for (const entry of entries) {
    ws.addRow([
      entry.createdAt.toISOString().replace("T", " ").slice(0, 19),
      entry.userName ?? "-",
      entry.department ?? "-",
      entry.documentNumber ?? "-",
      `${entry.entity} ${entry.entityId.slice(0, 8)}`,
      entry.action,
      entry.field ?? "-",
      entry.oldValue ?? "-",
      entry.newValue ?? "-",
      entry.reason ?? "-",
    ]);
  }
  const lastRow = ws.lastRow?.number ?? headerRow;
  styleDataRows(ws, columns, headerRow + 1, lastRow);
  finishTable(ws, headerRow, lastRow, columns.length);
  return workbookResponse(wb, `audit-trail-${today}.xlsx`);
}
