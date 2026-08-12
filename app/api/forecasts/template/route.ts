import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { shortProductName } from "@/lib/format";
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
  workbookResponse,
  type ColumnSpec,
} from "@/lib/excel";

export const dynamic = "force-dynamic";

const TEMPLATE_MONTHS = 6;

/**
 * GET /api/forecasts/template — styled .xlsx the user fills in and uploads
 * back. Columns: PR Code, Description, Caviar Type, Unit, then six month
 * columns (current month + next 5, "2026-08"-style headers). Rows are the
 * active Caviar + Fish Roe products, prefilled with the current user's
 * existing forecasts so the file round-trips.
 */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();
  const months: string[] = [];
  const monthDates: Date[] = [];
  for (let i = 0; i < TEMPLATE_MONTHS; i++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    monthDates.push(date);
    months.push(monthKeyOf(date));
  }

  const [products, existing] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, category: { in: ["Caviar", "Fish Roe"] } },
      select: { id: true, prCode: true, name: true, caviarType: true, unit: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.forecast.findMany({
      where: {
        userId: user.id,
        month: { gte: monthDates[0], lte: monthDates[TEMPLATE_MONTHS - 1] },
      },
      select: { productId: true, month: true, quantity: true },
    }),
  ]);

  const prefill = new Map<string, number>();
  for (const f of existing) {
    prefill.set(`${f.productId}|${monthKeyOf(f.month)}`, f.quantity);
  }

  const names = products.map((p) => shortProductName(p.name));
  const columns: ColumnSpec[] = [
    { header: "PR Code", width: fitWidth("PR Code", products.map((p) => p.prCode)) },
    { header: "Description", width: fitWidth("Description", names) },
    {
      header: "Caviar Type",
      width: fitWidth("Caviar Type", products.map((p) => p.caviarType)),
    },
    { header: "Unit", width: 8 },
    ...months.map((m) => ({
      header: m,
      width: 11,
      align: "right" as const,
      numFmt: NUM_FMT,
    })),
  ];

  const wb = createWorkbook();
  const ws = wb.addWorksheet("Forecast");

  addTitleBlock(
    ws,
    "Kaviari Cellar — Forecast template",
    columns.length,
    "Enter monthly forecast quantities in each product's unit. Blank keeps the saved value; 0 clears it. Do not edit the PR Code column."
  );
  addInfoBlock(ws, "How it works", [
    ["Person", `${user.name} — uploads are saved under your account`],
    ["Months", `${months[0]} to ${months[months.length - 1]}`],
    ["Upload", "Consumption & Forecasts page → Upload filled template"],
  ]);

  const headerRow = addHeaderRow(ws, columns);
  ws.getRow(headerRow).getCell(1).note =
    "Do not edit this column — PR codes match rows to products on upload.";

  for (const p of products) {
    const row = ws.addRow([
      p.prCode,
      shortProductName(p.name),
      p.caviarType ?? "",
      p.unit,
      ...months.map((m) => prefill.get(`${p.id}|${m}`) ?? null),
    ]);
    // Keep PR codes as text so leading zeros survive a round-trip.
    row.getCell(1).value = p.prCode;
  }

  const lastRow = headerRow + products.length;
  styleDataRows(ws, columns, headerRow + 1, lastRow);
  finishTable(ws, headerRow, lastRow, columns.length);

  return workbookResponse(wb, `forecast_template_${months[0]}.xlsx`);
}
