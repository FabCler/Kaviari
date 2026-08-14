import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  buildAnalysis,
  describeFilters,
  WEEKLY_FORECAST_NOTE,
} from "@/components/consume-analysis/aggregate";
import { loadAnalysisData } from "@/components/consume-analysis/data";
import { analysisFiltersSchema } from "@/components/consume-analysis/types";
import {
  addHeaderRow,
  addInfoBlock,
  addTitleBlock,
  createWorkbook,
  finishTable,
  fitWidth,
  KG_FMT,
  NUM_FMT,
  PCT_FMT,
  styleDataRows,
  styleTotalsRow,
  workbookResponse,
  type ColumnSpec,
} from "@/lib/excel";

export const dynamic = "force-dynamic";

/**
 * POST /api/exports/consumption — the current filter state as JSON.
 * The server REBUILDS the same aggregation the client view shows (client
 * rows are never trusted) and streams a styled two-sheet workbook:
 * "Consumption" (the detailed table) and "By period" (the chart matrix).
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
  const parsed = analysisFiltersSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid filters" },
      { status: 400 }
    );
  }
  const filters = parsed.data;

  const now = new Date();
  const data = await loadAnalysisData(now);
  const result = buildAnalysis(data, filters, now);
  const rows = filters.showAll
    ? result.rows
    : result.rows.filter((r) => r.units !== 0 || r.forecast !== 0);

  const filterEntries = describeFilters(filters, data.people, result);
  const generated = `Generated ${formatDate(now)} — Kaviari Cellar`;

  const wb = createWorkbook();

  // ---- Sheet 1: Consumption (the detailed table) ----
  const consumedHeader = `Consumed — ${result.periodLabel}`;
  const columns: ColumnSpec[] = [
    { header: "Code", width: fitWidth("Code", rows.map((r) => r.prCode)) },
    { header: "Description", width: fitWidth("Description", rows.map((r) => r.name)) },
    { header: "Type", width: fitWidth("Type", rows.map((r) => r.caviarType)) },
    { header: "Category", width: fitWidth("Category", rows.map((r) => r.category)) },
    { header: "Unit", width: 8 },
    {
      header: consumedHeader,
      width: Math.max(12, consumedHeader.length + 2),
      align: "right",
      numFmt: NUM_FMT,
    },
    { header: "Kg (ref)", width: 11, align: "right", numFmt: KG_FMT },
    { header: "Share %", width: 10, align: "right", numFmt: PCT_FMT },
    { header: "Avg / week", width: 12, align: "right", numFmt: NUM_FMT },
    { header: "Forecast", width: 11, align: "right", numFmt: NUM_FMT },
    { header: "Variance", width: 11, align: "right", numFmt: NUM_FMT, redNegative: true },
  ];

  const ws = wb.addWorksheet("Consumption");
  addTitleBlock(ws, "Kaviari Cellar — Consumption & Forecasts", columns.length, generated);
  addInfoBlock(ws, "Filters", filterEntries);

  const headerRow = addHeaderRow(ws, columns);
  for (const r of rows) {
    ws.addRow([
      r.prCode,
      r.name,
      r.caviarType ?? "",
      r.category,
      r.unit,
      r.units,
      r.grams / 1000,
      r.sharePct,
      r.avgPerWeek,
      r.forecast,
      r.variance,
    ]);
  }
  const lastDataRow = headerRow + rows.length;
  styleDataRows(ws, columns, headerRow + 1, lastDataRow);

  const totalsRow = ws.addRow([
    "Total",
    "",
    "",
    "",
    "",
    result.totals.units,
    result.totals.grams / 1000,
    result.totals.units > 0 ? 100 : 0,
    result.totals.avgPerWeek,
    result.totals.forecast,
    result.totals.variance,
  ]);
  styleTotalsRow(ws, columns, totalsRow.number);
  finishTable(ws, headerRow, lastDataRow, columns.length);

  // ---- Sheet 2: By period (bucket × series matrix of the chart) ----
  const periodColumns: ColumnSpec[] = [
    { header: "Period", width: fitWidth("Period", result.chartData.map((r) => r.label)) },
    ...result.series.map((s) => ({
      header: s.label,
      width: Math.max(11, s.label.length + 3),
      align: "right" as const,
      numFmt: NUM_FMT,
    })),
    ...(filters.compare
      ? [{ header: "Forecast", width: 11, align: "right" as const, numFmt: NUM_FMT }]
      : []),
  ];

  const ws2 = wb.addWorksheet("By period");
  addTitleBlock(
    ws2,
    "By period",
    periodColumns.length,
    filters.granularity === "weekly" && filters.compare
      ? `${generated}. ${WEEKLY_FORECAST_NOTE}`
      : generated
  );
  addInfoBlock(ws2, "Filters", filterEntries);

  const headerRow2 = addHeaderRow(ws2, periodColumns);
  for (const point of result.chartData) {
    ws2.addRow([
      point.label,
      ...result.series.map((s) => Number(point[s.id] ?? 0)),
      ...(filters.compare ? [Number(point.forecast ?? 0)] : []),
    ]);
  }
  const lastRow2 = headerRow2 + result.chartData.length;
  styleDataRows(ws2, periodColumns, headerRow2 + 1, lastRow2);

  const totalsRow2 = ws2.addRow([
    "Total",
    ...result.series.map((s) =>
      result.chartData.reduce((sum, point) => sum + Number(point[s.id] ?? 0), 0)
    ),
    ...(filters.compare ? [result.totals.forecast] : []),
  ]);
  styleTotalsRow(ws2, periodColumns, totalsRow2.number);
  finishTable(ws2, headerRow2, lastRow2, periodColumns.length);

  const filename = `consumption_${now.toISOString().slice(0, 10)}.xlsx`;
  return workbookResponse(wb, filename);
}
