import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { shortProductName } from "@/lib/format";
import { monthKeyOf } from "@/components/consume-analysis/aggregate";
import {
  addHeaderRow,
  addInfoBlock,
  addTitleBlock,
  createWorkbook,
  EXCEL_COLORS,
  finishTable,
  fitWidth,
  NUM_FMT,
  solidFill,
  styleDataRows,
  workbookResponse,
  type ColumnSpec,
} from "@/lib/excel";

export const dynamic = "force-dynamic";

const TEMPLATE_MONTHS = 3;

/**
 * GET /api/forecasts/template — the customer-level forecast template. One
 * row per customer × month (next TEMPLATE_MONTHS months), with the
 * customer's sales rep, and one column per product (headed by its PR code —
 * a product-name row sits above the header for readability). Cells are
 * prefilled with the saved customer forecasts so the file round-trips:
 * blank keeps the saved value, 0 clears it.
 */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();
  const months: string[] = [];
  const monthDates: Date[] = [];
  for (let i = 0; i < TEMPLATE_MONTHS; i++) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 + i, 1)
    );
    monthDates.push(date);
    months.push(monthKeyOf(date));
  }

  const [products, reps, saleCustomers, forecasts] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, category: { in: ["Caviar", "Fish Roe"] } },
      select: { id: true, prCode: true, name: true },
      orderBy: [{ caviarType: "asc" }, { name: "asc" }],
    }),
    prisma.customerRep.findMany(),
    prisma.customerSale.findMany({
      select: { customerCode: true, customerName: true },
      distinct: ["customerCode"],
    }),
    prisma.customerForecast.findMany({
      where: {
        month: { gte: monthDates[0], lte: monthDates[TEMPLATE_MONTHS - 1] },
      },
      select: {
        customerCode: true,
        customerName: true,
        productId: true,
        month: true,
        quantity: true,
      },
    }),
  ]);

  // Every customer the app knows: rep assignments, Top 90% sales, and any
  // already-forecasted customer.
  const repOf = new Map(reps.map((r) => [r.customerCode, r.repName]));
  const customers = new Map<string, string>();
  for (const c of saleCustomers) customers.set(c.customerCode, c.customerName);
  for (const f of forecasts) {
    if (!customers.has(f.customerCode)) {
      customers.set(f.customerCode, f.customerName);
    }
  }
  for (const r of reps) {
    if (!customers.has(r.customerCode)) customers.set(r.customerCode, r.customerCode);
  }
  const customerList = [...customers.entries()]
    .map(([code, name]) => ({ code, name, rep: repOf.get(code) ?? "" }))
    .sort(
      (a, b) =>
        (a.rep || "zzz").localeCompare(b.rep || "zzz") ||
        a.name.localeCompare(b.name)
    );

  const prefill = new Map<string, number>();
  for (const f of forecasts) {
    prefill.set(
      `${f.customerCode}|${f.productId}|${monthKeyOf(f.month)}`,
      f.quantity
    );
  }

  const names = customerList.map((c) => c.name);
  const columns: ColumnSpec[] = [
    {
      header: "Customer Code",
      width: fitWidth("Customer Code", customerList.map((c) => c.code)),
    },
    { header: "Customer", width: fitWidth("Customer", names) },
    {
      header: "Sales rep",
      width: fitWidth("Sales rep", customerList.map((c) => c.rep)),
    },
    { header: "Month", width: 10 },
    ...products.map((p) => ({
      header: p.prCode,
      width: 10,
      align: "right" as const,
      numFmt: NUM_FMT,
    })),
  ];

  const wb = createWorkbook();
  const ws = wb.addWorksheet("Forecast");

  addTitleBlock(
    ws,
    "Kaviari Cellar — Customer forecast template",
    Math.min(columns.length, 12),
    "One row per customer and month. Enter forecast units under each product (PR-code columns). Blank keeps the saved value; 0 clears it. Do not edit the Customer Code, Month or PR-code headers."
  );
  addInfoBlock(ws, "How it works", [
    ["Person", `${user.name} — uploads are recorded under your name`],
    ["Months", `${months[0]} to ${months[months.length - 1]}`],
    ["Upload", "Consumption & Forecasts page → Upload filled template"],
  ]);

  // Product-name row above the header (readability only — not parsed).
  ws.addRow([]);
  const nameRow = ws.addRow([
    "",
    "",
    "",
    "Product →",
    ...products.map((p) => shortProductName(p.name)),
  ]);
  nameRow.eachCell((cell) => {
    cell.font = { size: 8, color: { argb: EXCEL_COLORS.muted } };
    cell.alignment = { textRotation: 60, vertical: "bottom" };
  });
  nameRow.height = 90;

  const headerRow = addHeaderRow(ws, columns);
  ws.getRow(headerRow).getCell(1).note =
    "Do not edit this column — customer codes match rows on upload.";

  for (const customer of customerList) {
    for (const month of months) {
      const row = ws.addRow([
        customer.code,
        customer.name,
        customer.rep,
        month,
        ...products.map(
          (p) => prefill.get(`${customer.code}|${p.id}|${month}`) ?? null
        ),
      ]);
      row.getCell(1).value = customer.code;
      // Month as text so "2026-10" survives the round-trip unchanged.
      row.getCell(4).value = month;
    }
  }

  const lastRow = headerRow + customerList.length * months.length;
  styleDataRows(ws, columns, headerRow + 1, lastRow);
  // Tint the identity columns so the fill-in area stands out.
  for (let r = headerRow + 1; r <= lastRow; r++) {
    for (let c = 1; c <= 4; c++) {
      ws.getRow(r).getCell(c).fill = solidFill("FFF3EFE4");
    }
  }
  finishTable(ws, headerRow, lastRow, columns.length);
  ws.views = [
    { state: "frozen", ySplit: headerRow, xSplit: 4 },
  ];

  return workbookResponse(wb, `forecast_template_${months[0]}.xlsx`);
}
