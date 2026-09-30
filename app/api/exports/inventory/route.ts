import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { loadInventoryRows } from "@/components/inventory/data";
import {
  ALL,
  applyInventoryView,
  inventoryViewSchema,
  SORT_KEYS,
} from "@/components/inventory/lib";
import {
  addHeaderRow,
  addInfoBlock,
  addTitleBlock,
  createWorkbook,
  finishTable,
  fitWidth,
  NUM_FMT,
  styleDataRows,
  styleTotalsRow,
  workbookResponse,
  type ColumnSpec,
} from "@/lib/excel";

export const dynamic = "force-dynamic";

const SORT_LABELS: Record<(typeof SORT_KEYS)[number], string> = {
  prCode: "Code",
  name: "Product",
  onHand: "Stock on hand",
  onOrder: "Order",
  consumed: "Consumed (current month)",
  consumedPrev: "Consumed (previous month)",
  consumed30: "Consumed (30 d)",
  cover: "Cover",
  forecast0: "Forecast (month 1)",
  forecast1: "Forecast (month 2)",
  forecast2: "Forecast (month 3)",
};

/**
 * POST /api/exports/inventory — the current view state as JSON. The server
 * REBUILDS the same rows the Inventory table shows (filters, dormant
 * toggle, column sort, forecast horizon) and streams a styled workbook that
 * mirrors the on-screen columns.
 */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = inventoryViewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid view" },
      { status: 400 }
    );
  }
  const view = parsed.data;

  const now = new Date();
  const { rows, forecastMonthLabels, consumedMonthLabels } =
    await loadInventoryRows(now);
  const visible = applyInventoryView(rows, view);
  const months = forecastMonthLabels.slice(0, view.forecastHorizon);

  const filterEntries: [string, string][] = [
    ["Category", view.category === ALL ? "All" : view.category],
    ["Caviar type", view.caviarType === ALL ? "All" : view.caviarType],
    ["Forecast", `${view.forecastHorizon} month${view.forecastHorizon > 1 ? "s" : ""}`],
    ["Dormant products", view.showDormant ? "Shown" : "Hidden"],
    [
      "Sorted by",
      view.sort
        ? `${SORT_LABELS[view.sort.key]} (${view.sort.dir === "asc" ? "ascending" : "descending"})`
        : "Default order",
    ],
  ];

  const numCol = (header: string): ColumnSpec => ({
    header,
    width: Math.max(11, header.length + 2),
    align: "right",
    numFmt: NUM_FMT,
  });
  const columns: ColumnSpec[] = [
    { header: "Code", width: fitWidth("Code", visible.map((r) => r.prCode)) },
    { header: "Product", width: fitWidth("Product", visible.map((r) => r.name)) },
    { header: "Type", width: fitWidth("Type", visible.map((r) => r.caviarType)) },
    { header: "Category", width: fitWidth("Category", visible.map((r) => r.category)) },
    { header: "Unit", width: 8 },
    numCol("Order"),
    numCol("Stock on hand"),
    numCol(`Consumed ${consumedMonthLabels.previous}`),
    numCol(`Consumed ${consumedMonthLabels.current}`),
    numCol("Consumed (30 d)"),
    ...months.map((label) => numCol(`Forecast ${label}`)),
    { header: "Cover (weeks)", width: 13, align: "right" },
  ];

  const wb = createWorkbook();
  const ws = wb.addWorksheet("Inventory");
  addTitleBlock(
    ws,
    "Kaviari Cellar — Inventory",
    columns.length,
    `Generated ${formatDate(now)} — on-hand stock, pipeline and forecasts, as filtered on screen.`
  );
  addInfoBlock(ws, "View", filterEntries);

  const headerRow = addHeaderRow(ws, columns);
  for (const row of visible) {
    ws.addRow([
      row.prCode,
      row.name,
      row.caviarType ?? "",
      row.category,
      row.unit,
      row.onOrderUnits,
      row.onHandUnits,
      row.consumedPrevMonthUnits,
      row.consumedThisMonthUnits,
      row.consumed30dUnits,
      ...months.map((_, i) => row.forecastMonths[i] ?? 0),
      row.weeksOfCover === null
        ? "∞"
        : Math.round(row.weeksOfCover * 10) / 10,
    ]);
  }
  const lastRow = headerRow + visible.length;
  styleDataRows(ws, columns, headerRow + 1, lastRow);

  const sum = (pick: (r: (typeof visible)[number]) => number) =>
    Math.round(visible.reduce((total, r) => total + pick(r), 0) * 100) / 100;
  const totalsRow = ws.addRow([
    "Total",
    "",
    "",
    "",
    "",
    sum((r) => r.onOrderUnits),
    sum((r) => r.onHandUnits),
    sum((r) => r.consumedPrevMonthUnits),
    sum((r) => r.consumedThisMonthUnits),
    sum((r) => r.consumed30dUnits),
    ...months.map((_, i) => sum((r) => r.forecastMonths[i] ?? 0)),
    "",
  ]);
  styleTotalsRow(ws, columns, totalsRow.number);
  finishTable(ws, headerRow, lastRow, columns.length);

  const filename = `inventory_${now.toISOString().slice(0, 10)}.xlsx`;
  return workbookResponse(wb, filename);
}
