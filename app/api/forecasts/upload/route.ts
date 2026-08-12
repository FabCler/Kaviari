import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { round2 } from "@/components/consume-analysis/aggregate";
import { MONTH_KEY_RE, parseMonthInRange } from "@/app/api/forecasts/lib";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 2000;
const PR_CODE_RE = /^pr\s*code$/i;

type Cell = string | number | boolean | Date | null;

function cellText(cell: Cell): string {
  if (cell == null) return "";
  if (cell instanceof Date) {
    // A "2026-08" header Excel converted to a real date.
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}`;
  }
  return String(cell).trim();
}

interface FoundTable {
  rows: Cell[][];
  headerIndex: number;
  prCodeCol: number;
  monthCols: { col: number; month: string }[];
}

/** Scan every sheet for a header row containing "PR Code" + YYYY-MM columns. */
function findTable(workbook: XLSX.WorkBook): FoundTable | null {
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
      if (monthCols.length > 0) {
        return { rows, headerIndex: i, prCodeCol, monthCols };
      }
    }
  }
  return null;
}

/**
 * POST /api/forecasts/upload — multipart { file }: a filled forecast
 * template. Upserts the CURRENT USER's forecasts (blank cells untouched,
 * 0 deletes). Responds { updated, deleted, skipped: string[] }.
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

  const table = findTable(workbook);
  if (!table) {
    return Response.json(
      {
        error:
          'Could not find the forecast table — expected a "PR Code" column plus month columns like "2026-08". Download a fresh template and try again.',
      },
      { status: 422 }
    );
  }

  const now = new Date();
  const skipped: string[] = [];

  // Validate month columns once; out-of-range months are reported, not fatal.
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
      { error: "None of the month columns are inside the editable range (1 month back to 18 months ahead)." },
      { status: 422 }
    );
  }

  const products = await prisma.product.findMany({
    select: { id: true, prCode: true },
  });
  const byPrCode = new Map(products.map((p) => [p.prCode, p.id]));

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
      return; // blank row
    }
    const excelRow = table.headerIndex + i + 2; // 1-based, as seen in Excel
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
      if (cell == null || cellText(cell) === "") continue; // blank = keep as-is
      const quantity =
        typeof cell === "number" ? cell : Number.parseFloat(cellText(cell).replace(/,/g, ""));
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
        skipped.push(`Row ${excelRow}: invalid quantity "${cellText(cell)}" for ${month}`);
        continue;
      }
      ops.set(`${productId}|${month}`, {
        productId,
        month: date,
        quantity: round2(quantity),
      });
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
          where: { userId: user.id, productId: op.productId, month: op.month },
        });
        deleted += result.count;
      } else {
        await tx.forecast.upsert({
          where: {
            userId_productId_month: {
              userId: user.id,
              productId: op.productId,
              month: op.month,
            },
          },
          create: {
            userId: user.id,
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
