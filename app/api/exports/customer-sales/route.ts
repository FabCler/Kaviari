import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  buildCustomerAnalysis,
  customerFiltersSchema,
  MONTH_LABELS,
  OTHER_TYPE,
  samePeriodLabel,
} from "@/components/customers/aggregate";
import { loadCustomerSalesEntries } from "@/components/customers/data";
import {
  addHeaderRow,
  addInfoBlock,
  addTitleBlock,
  createWorkbook,
  EXCEL_COLORS,
  finishTable,
  fitWidth,
  NUM_FMT,
  PCT_FMT,
  styleDataRows,
  styleTotalsRow,
  workbookResponse,
  type ColumnSpec,
} from "@/lib/excel";

export const dynamic = "force-dynamic";

/**
 * POST /api/exports/customer-sales — the current filter state as JSON.
 * The server REBUILDS the same aggregation the Customers page shows and
 * streams a styled workbook: "Customers" (the pivot with per-group detail
 * rows) and "By month" (the chart matrix).
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
  const parsed = customerFiltersSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid filters" },
      { status: 400 }
    );
  }
  const filters = parsed.data;

  const { entries, years } = await loadCustomerSalesEntries();
  const compare = filters.compareN1 && years.includes(filters.year - 1);
  const analysis = buildCustomerAnalysis(entries, {
    ...filters,
    compareN1: compare,
  });
  const { maxDataMonth, groupRows, monthTotals } = analysis;
  const visibleMonths = MONTH_LABELS.slice(0, maxDataMonth);
  const prevLabel = samePeriodLabel(filters.year, maxDataMonth);

  const now = new Date();
  const generated = `Generated ${formatDate(now)} — Kaviari Cellar`;

  // Describe the filters for the info block.
  const customerNames = new Map(
    entries.map((e) => [e.customerCode, e.customerName])
  );
  const productNames = new Map<string, string>();
  for (const e of entries) {
    productNames.set(e.prCode ?? `name:${e.productName}`, e.productName);
  }
  const filterEntries: [string, string][] = [
    ["Year", String(filters.year)],
    [
      "Customers",
      filters.customers.length === 0
        ? "All"
        : filters.customers
            .map((code) => customerNames.get(code) ?? code)
            .join(", "),
    ],
    [
      "Caviar types",
      filters.caviarTypes.length === 0
        ? "All"
        : filters.caviarTypes
            .map((t) => (t === OTHER_TYPE ? "Other products" : t))
            .join(", "),
    ],
    [
      "Products",
      filters.products.length === 0
        ? "All"
        : filters.products
            .map((key) => productNames.get(key) ?? key)
            .join(", "),
    ],
    ["Rows", filters.grouping === "customer" ? "By customer" : "By product"],
    ["Compare N-1", compare ? `Yes (${prevLabel})` : "No"],
  ];

  const wb = createWorkbook();

  // ---- Sheet 1: the pivot, group rows followed by their detail rows ----
  const numCol = (header: string): ColumnSpec => ({
    header,
    width: Math.max(9, header.length + 2),
    align: "right",
    numFmt: NUM_FMT,
  });
  const allNames = groupRows.flatMap((g) => [
    g.name,
    ...g.details.map((d) => `    ${d.name}`),
  ]);
  const columns: ColumnSpec[] = [
    {
      header: "Code",
      width: fitWidth(
        "Code",
        groupRows.flatMap((g) => [g.code, ...g.details.map((d) => d.code)])
      ),
    },
    {
      header: filters.grouping === "customer" ? "Customer" : "Product",
      width: fitWidth("Customer", allNames),
    },
    ...visibleMonths.map((label) => numCol(label)),
    numCol(`Total ${filters.year}`),
    ...(compare
      ? [
          numCol(prevLabel),
          {
            header: "Δ %",
            width: 9,
            align: "right" as const,
            numFmt: PCT_FMT,
            redNegative: true,
          },
        ]
      : []),
  ];

  const quantityCells = (row: {
    months: number[];
    total: number;
    prevTotal: number;
  }) => [
    ...visibleMonths.map((_, i) => row.months[i] || 0),
    row.total,
    ...(compare
      ? [
          row.prevTotal,
          row.prevTotal > 0
            ? ((row.total - row.prevTotal) / row.prevTotal) * 100
            : "",
        ]
      : []),
  ];

  const ws = wb.addWorksheet("Customers");
  addTitleBlock(
    ws,
    "Kaviari Cellar — Customers consumption (Top 90% sales)",
    columns.length,
    generated
  );
  addInfoBlock(ws, "Filters", filterEntries);

  const headerRow = addHeaderRow(ws, columns);
  const detailRowNumbers = new Set<number>();
  for (const group of groupRows) {
    ws.addRow([group.code, group.name, ...quantityCells(group)]);
    for (const detail of group.details) {
      const row = ws.addRow([
        detail.code,
        detail.name,
        ...quantityCells(detail),
      ]);
      detailRowNumbers.add(row.number);
    }
  }
  const lastDataRow = ws.rowCount;
  styleDataRows(ws, columns, headerRow + 1, lastDataRow);

  // Group rows read bold; their breakdown rows are indented and muted.
  for (let r = headerRow + 1; r <= lastDataRow; r++) {
    const isDetail = detailRowNumbers.has(r);
    const row = ws.getRow(r);
    if (isDetail) {
      row.getCell(2).alignment = { indent: 2 };
      for (let c = 1; c <= columns.length; c++) {
        row.getCell(c).font = {
          size: 9,
          color: { argb: EXCEL_COLORS.muted },
        };
      }
    } else {
      row.getCell(2).font = { bold: true, color: { argb: EXCEL_COLORS.ink } };
    }
  }

  const totalsRow = ws.addRow([
    "Total",
    "",
    ...visibleMonths.map((_, i) => monthTotals[i].current),
    analysis.currentTotal,
    ...(compare
      ? [
          analysis.previousSameTotal,
          analysis.previousSameTotal > 0
            ? ((analysis.currentTotal - analysis.previousSameTotal) /
                analysis.previousSameTotal) *
              100
            : "",
        ]
      : []),
  ]);
  styleTotalsRow(ws, columns, totalsRow.number);
  finishTable(ws, headerRow, lastDataRow, columns.length);

  // ---- Sheet 2: By month (the chart matrix) ----
  const monthColumns: ColumnSpec[] = [
    { header: "Month", width: 10 },
    numCol(String(filters.year)),
    ...(compare ? [numCol(String(filters.year - 1))] : []),
  ];
  const ws2 = wb.addWorksheet("By month");
  addTitleBlock(ws2, "By month", monthColumns.length, generated);
  addInfoBlock(ws2, "Filters", filterEntries);
  const headerRow2 = addHeaderRow(ws2, monthColumns);
  for (const point of monthTotals) {
    ws2.addRow([
      point.label,
      point.current,
      ...(compare ? [point.prev] : []),
    ]);
  }
  const lastRow2 = headerRow2 + monthTotals.length;
  styleDataRows(ws2, monthColumns, headerRow2 + 1, lastRow2);
  const totalsRow2 = ws2.addRow([
    "Total",
    analysis.currentTotal,
    ...(compare
      ? [monthTotals.reduce((sum, point) => sum + point.prev, 0)]
      : []),
  ]);
  styleTotalsRow(ws2, monthColumns, totalsRow2.number);
  finishTable(ws2, headerRow2, lastRow2, monthColumns.length);

  const filename = `customers_top90_${now.toISOString().slice(0, 10)}.xlsx`;
  return workbookResponse(wb, filename);
}
