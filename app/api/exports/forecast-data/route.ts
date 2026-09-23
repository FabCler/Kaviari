import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { formatDate, shortProductName } from "@/lib/format";
import { monthKeyOf } from "@/components/consume-analysis/aggregate";
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

/**
 * GET /api/exports/forecast-data — owner-only audit export of every saved
 * forecast: who forecasted, for which customer, which product, which month
 * and how many units. Customer-template rows carry their customer; on-site
 * editor rows appear under "(in-app editor)".
 */
export async function GET() {
  const gate = await requireOwner();
  if (gate instanceof Response) return gate;

  const [customerRows, freeRows, reps] = await Promise.all([
    prisma.customerForecast.findMany({
      include: {
        product: { select: { prCode: true, name: true, unit: true } },
        enteredBy: { select: { name: true, email: true } },
      },
    }),
    prisma.forecast.findMany({
      include: {
        product: { select: { prCode: true, name: true, unit: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.customerRep.findMany(),
  ]);
  const repOf = new Map(reps.map((r) => [r.customerCode, r.repName]));

  interface AuditRow {
    customerCode: string;
    customerName: string;
    rep: string;
    prCode: string;
    productName: string;
    month: string;
    quantity: number;
    forecastedBy: string;
    updatedAt: Date;
  }
  const rows: AuditRow[] = [
    ...customerRows.map((row) => ({
      customerCode: row.customerCode,
      customerName: row.customerName,
      rep: repOf.get(row.customerCode) ?? "",
      prCode: row.product.prCode,
      productName: shortProductName(row.product.name),
      month: monthKeyOf(row.month),
      quantity: row.quantity,
      forecastedBy: row.enteredBy
        ? `${row.enteredBy.name} (${row.enteredBy.email})`
        : "(account removed)",
      updatedAt: row.updatedAt,
    })),
    ...freeRows.map((row) => ({
      customerCode: "",
      customerName: "(in-app editor)",
      rep: "",
      prCode: row.product.prCode,
      productName: shortProductName(row.product.name),
      month: monthKeyOf(row.month),
      quantity: row.quantity,
      forecastedBy: `${row.user.name} (${row.user.email})`,
      updatedAt: row.updatedAt,
    })),
  ].sort(
    (a, b) =>
      (a.rep || "zzz").localeCompare(b.rep || "zzz") ||
      a.customerName.localeCompare(b.customerName) ||
      a.month.localeCompare(b.month) ||
      a.productName.localeCompare(b.productName)
  );

  const columns: ColumnSpec[] = [
    { header: "Customer Code", width: fitWidth("Customer Code", rows.map((r) => r.customerCode)) },
    { header: "Customer", width: fitWidth("Customer", rows.map((r) => r.customerName)) },
    { header: "Sales rep", width: fitWidth("Sales rep", rows.map((r) => r.rep)) },
    { header: "PR Code", width: 9 },
    { header: "Product", width: fitWidth("Product", rows.map((r) => r.productName)) },
    { header: "Month", width: 10 },
    { header: "Quantity", width: 10, align: "right", numFmt: NUM_FMT },
    { header: "Forecasted by", width: fitWidth("Forecasted by", rows.map((r) => r.forecastedBy)) },
    { header: "Last updated", width: 13 },
  ];

  const now = new Date();
  const wb = createWorkbook();
  const ws = wb.addWorksheet("Forecast data");
  addTitleBlock(
    ws,
    "Kaviari Cellar — Forecast data (who forecasted what)",
    columns.length,
    `Generated ${formatDate(now)} — every saved forecast with its customer and author.`
  );
  addInfoBlock(ws, "Contents", [
    ["Customer forecasts", `${customerRows.length} rows (FS template)`],
    ["In-app editor forecasts", `${freeRows.length} rows`],
  ]);

  const headerRow = addHeaderRow(ws, columns);
  for (const row of rows) {
    ws.addRow([
      row.customerCode,
      row.customerName,
      row.rep,
      row.prCode,
      row.productName,
      row.month,
      row.quantity,
      row.forecastedBy,
      formatDate(row.updatedAt),
    ]);
  }
  const lastRow = headerRow + rows.length;
  styleDataRows(ws, columns, headerRow + 1, lastRow);
  const totalsRow = ws.addRow([
    "Total",
    "",
    "",
    "",
    "",
    "",
    Math.round(rows.reduce((sum, r) => sum + r.quantity, 0) * 100) / 100,
    "",
    "",
  ]);
  styleTotalsRow(ws, columns, totalsRow.number);
  finishTable(ws, headerRow, lastRow, columns.length);

  return workbookResponse(
    wb,
    `forecast_data_${now.toISOString().slice(0, 10)}.xlsx`
  );
}
