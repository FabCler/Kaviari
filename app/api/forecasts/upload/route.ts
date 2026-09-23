import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { round2 } from "@/components/consume-analysis/aggregate";
import { MONTH_KEY_RE, parseMonthInRange } from "@/app/api/forecasts/lib";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 5000;
const CUSTOMER_CODE_RE = /^customer\s*code$/i;
const MONTH_HEADER_RE = /^month$/i;
const PR_CODE_RE = /^pr\s*code$/i;

type Cell = string | number | boolean | Date | null;

function cellText(cell: Cell): string {
  if (cell == null) return "";
  if (cell instanceof Date) {
    // A "2026-10" header/cell Excel converted to a real date.
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}`;
  }
  return String(cell).trim();
}

function parseQuantity(cell: Cell): number | null {
  const quantity =
    typeof cell === "number"
      ? cell
      : Number.parseFloat(cellText(cell).replace(/,/g, ""));
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
    return null;
  }
  return round2(quantity);
}

interface CustomerTable {
  rows: Cell[][];
  headerIndex: number;
  codeCol: number;
  monthCol: number;
  /** Column → PR code, for headers that match a catalog product. */
  productCols: { col: number; prCode: string }[];
  unknownHeaders: string[];
}

/**
 * The customer template: a header row with "Customer Code" and "Month"
 * columns plus one column per product, headed by its PR code.
 */
function findCustomerTable(
  workbook: XLSX.WorkBook,
  knownPrCodes: Set<string>
): CustomerTable | null {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const codeCol = row.findIndex((c) => CUSTOMER_CODE_RE.test(cellText(c)));
      const monthCol = row.findIndex((c) => MONTH_HEADER_RE.test(cellText(c)));
      if (codeCol === -1 || monthCol === -1) continue;
      const productCols: { col: number; prCode: string }[] = [];
      const unknownHeaders: string[] = [];
      row.forEach((c, col) => {
        if (col === codeCol || col === monthCol) return;
        const text = cellText(c);
        if (!/^\d{3,6}$/.test(text)) return; // PR codes are numeric strings
        if (knownPrCodes.has(text)) productCols.push({ col, prCode: text });
        else unknownHeaders.push(text);
      });
      if (productCols.length > 0) {
        return { rows, headerIndex: i, codeCol, monthCol, productCols, unknownHeaders };
      }
    }
  }
  return null;
}

interface LegacyTable {
  rows: Cell[][];
  headerIndex: number;
  prCodeCol: number;
  monthCols: { col: number; month: string }[];
}

/** The pre-customer template: "PR Code" rows × YYYY-MM month columns. */
function findLegacyTable(workbook: XLSX.WorkBook): LegacyTable | null {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const prCodeCol = row.findIndex((c) => PR_CODE_RE.test(cellText(c)));
      if (prCodeCol === -1) continue;
      const monthCols: { col: number; month: string }[] = [];
      row.forEach((c, col) => {
        const text = cellText(c);
        if (MONTH_KEY_RE.test(text)) monthCols.push({ col, month: text });
      });
      if (monthCols.length > 0) return { rows, headerIndex: i, prCodeCol, monthCols };
    }
  }
  return null;
}

/**
 * POST /api/forecasts/upload — multipart { file }: a filled forecast
 * template. The customer template upserts CustomerForecast rows (recorded
 * under the uploading user, so the owner can audit who forecasted what);
 * the older product-level template still works and saves the current
 * user's own product forecasts. Blank cells are untouched, 0 clears.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart/form-data upload." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: "The file is larger than 5 MB — export a lighter version." },
      { status: 413 }
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return Response.json(
      {
        error:
          "That file could not be read as a spreadsheet. Save it as .xlsx and try again.",
      },
      { status: 422 }
    );
  }

  const products = await prisma.product.findMany({
    select: { id: true, prCode: true },
  });
  const byPrCode = new Map(products.map((p) => [p.prCode, p.id]));

  const customerTable = findCustomerTable(workbook, new Set(byPrCode.keys()));
  if (customerTable) {
    return handleCustomerUpload(customerTable, byPrCode, user.id);
  }

  const legacyTable = findLegacyTable(workbook);
  if (legacyTable) {
    return handleLegacyUpload(legacyTable, byPrCode, user.id);
  }

  return Response.json(
    {
      error:
        'Could not find the forecast table — expected "Customer Code" and "Month" columns with PR-code product columns. Download a fresh template and try again.',
    },
    { status: 422 }
  );
}

async function handleCustomerUpload(
  table: CustomerTable,
  byPrCode: Map<string, string>,
  userId: string
): Promise<Response> {
  const now = new Date();
  const skipped: string[] = [];
  for (const header of table.unknownHeaders) {
    skipped.push(`Column ${header}: unknown PR code`);
  }

  const dataRows = table.rows.slice(table.headerIndex + 1);
  if (dataRows.length > MAX_DATA_ROWS) {
    return Response.json(
      { error: `Too many rows (${dataRows.length}) — the limit is ${MAX_DATA_ROWS}.` },
      { status: 422 }
    );
  }

  // Customer names come from the column right after the code when present.
  const nameCol = table.codeCol + 1;
  const ops = new Map<
    string,
    {
      customerCode: string;
      customerName: string;
      productId: string;
      month: Date;
      quantity: number;
    }
  >();

  dataRows.forEach((row, i) => {
    if (!Array.isArray(row) || row.every((c) => c == null || cellText(c) === "")) {
      return;
    }
    const excelRow = table.headerIndex + i + 2;
    const customerCode = cellText(row[table.codeCol]);
    if (!customerCode) {
      skipped.push(`Row ${excelRow}: missing customer code`);
      return;
    }
    const monthText = cellText(row[table.monthCol]);
    if (!MONTH_KEY_RE.test(monthText)) {
      skipped.push(`Row ${excelRow}: invalid month "${monthText}"`);
      return;
    }
    const parsed = parseMonthInRange(monthText, now);
    if ("error" in parsed) {
      skipped.push(`Row ${excelRow}: ${parsed.error.toLowerCase()}`);
      return;
    }
    const customerName = cellText(row[nameCol]) || customerCode;
    for (const { col, prCode } of table.productCols) {
      const cell = row[col];
      if (cell == null || cellText(cell) === "") continue; // blank = keep
      const quantity = parseQuantity(cell);
      if (quantity === null) {
        skipped.push(
          `Row ${excelRow}: invalid quantity "${cellText(cell)}" for ${prCode}`
        );
        continue;
      }
      ops.set(`${customerCode}|${prCode}|${monthText}`, {
        customerCode,
        customerName,
        productId: byPrCode.get(prCode)!,
        month: parsed.date,
        quantity,
      });
    }
  });

  if (ops.size === 0 && skipped.length === 0) {
    return Response.json(
      { error: "No forecast quantities were found in the file." },
      { status: 422 }
    );
  }

  // Re-uploading the prefilled template must not re-attribute untouched
  // cells: rows whose quantity is unchanged keep their original author.
  const existing = await prisma.customerForecast.findMany({
    select: {
      customerCode: true,
      productId: true,
      month: true,
      quantity: true,
    },
  });
  const existingQty = new Map(
    existing.map((row) => [
      `${row.customerCode}|${row.productId}|${row.month.toISOString()}`,
      row.quantity,
    ])
  );

  let updated = 0;
  let deleted = 0;
  await prisma.$transaction(async (tx) => {
    for (const op of ops.values()) {
      const key = `${op.customerCode}|${op.productId}|${op.month.toISOString()}`;
      if (op.quantity !== 0 && existingQty.get(key) === op.quantity) continue;
      const where = {
        customerCode_productId_month: {
          customerCode: op.customerCode,
          productId: op.productId,
          month: op.month,
        },
      };
      if (op.quantity === 0) {
        const result = await tx.customerForecast.deleteMany({
          where: {
            customerCode: op.customerCode,
            productId: op.productId,
            month: op.month,
          },
        });
        deleted += result.count;
      } else {
        await tx.customerForecast.upsert({
          where,
          create: {
            customerCode: op.customerCode,
            customerName: op.customerName,
            productId: op.productId,
            month: op.month,
            quantity: op.quantity,
            enteredById: userId,
          },
          update: {
            customerName: op.customerName,
            quantity: op.quantity,
            enteredById: userId,
          },
        });
        updated += 1;
      }
    }
  });

  return Response.json({ updated, deleted, skipped });
}

async function handleLegacyUpload(
  table: LegacyTable,
  byPrCode: Map<string, string>,
  userId: string
): Promise<Response> {
  const now = new Date();
  const skipped: string[] = [];

  const validMonths: { col: number; month: string; date: Date }[] = [];
  for (const { col, month } of table.monthCols) {
    const parsed = parseMonthInRange(month, now);
    if ("error" in parsed) {
      skipped.push(`Column ${month}: ${parsed.error.toLowerCase()}`);
    } else {
      validMonths.push({ col, month, date: parsed.date });
    }
  }
  if (validMonths.length === 0) {
    return Response.json(
      {
        error:
          "None of the month columns are inside the editable range (1 month back to 18 months ahead).",
      },
      { status: 422 }
    );
  }

  const dataRows = table.rows.slice(table.headerIndex + 1);
  if (dataRows.length > MAX_DATA_ROWS) {
    return Response.json(
      { error: `Too many rows (${dataRows.length}) — the limit is ${MAX_DATA_ROWS}.` },
      { status: 422 }
    );
  }

  const ops = new Map<string, { productId: string; month: Date; quantity: number }>();
  dataRows.forEach((row, i) => {
    if (!Array.isArray(row) || row.every((c) => c == null || cellText(c) === "")) {
      return;
    }
    const excelRow = table.headerIndex + i + 2;
    const prCode = cellText(row[table.prCodeCol]);
    if (!prCode) {
      skipped.push(`Row ${excelRow}: missing PR code`);
      return;
    }
    const productId = byPrCode.get(prCode);
    if (!productId) {
      skipped.push(`Row ${excelRow}: unknown PR code "${prCode}"`);
      return;
    }
    for (const { col, month, date } of validMonths) {
      const cell = row[col];
      if (cell == null || cellText(cell) === "") continue;
      const quantity = parseQuantity(cell);
      if (quantity === null) {
        skipped.push(`Row ${excelRow}: invalid quantity "${cellText(cell)}" for ${month}`);
        continue;
      }
      ops.set(`${productId}|${month}`, { productId, month: date, quantity });
    }
  });

  if (ops.size === 0 && skipped.length === 0) {
    return Response.json(
      { error: "No forecast quantities were found in the file." },
      { status: 422 }
    );
  }

  let updated = 0;
  let deleted = 0;
  await prisma.$transaction(async (tx) => {
    for (const op of ops.values()) {
      if (op.quantity === 0) {
        const result = await tx.forecast.deleteMany({
          where: { userId, productId: op.productId, month: op.month },
        });
        deleted += result.count;
      } else {
        await tx.forecast.upsert({
          where: {
            userId_productId_month: {
              userId,
              productId: op.productId,
              month: op.month,
            },
          },
          create: {
            userId,
            productId: op.productId,
            month: op.month,
            quantity: op.quantity,
          },
          update: { quantity: op.quantity },
        });
        updated += 1;
      }
    }
  });

  return Response.json({ updated, deleted, skipped });
}
