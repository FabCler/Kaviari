import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { applyCustomerSales } from "@/lib/customer-sales/apply";
import {
  CustomerSalesParseError,
  parseCustomerSalesWorkbook,
} from "@/lib/customer-sales/parse";
import { MAX_FILE_BYTES } from "@/lib/import/types";

/**
 * POST /api/customer-sales — multipart/form-data { file }.
 * A "Top 90% sales" pivot replaces all customer data; an invoice-line
 * export (e.g. Caviar_Item_Sep-Nov-26) replaces only the months it covers.
 * Parsing is deterministic — no AI involved.
 */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

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
    return Response.json(
      { error: "The uploaded file is empty." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: "The file is larger than 10 MB." },
      { status: 400 }
    );
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return Response.json(
      { error: "Upload the Excel export (.xlsx or .xls)." },
      { status: 400 }
    );
  }

  const caviarProducts = await prisma.product.findMany({
    where: { category: "Caviar" },
    select: { prCode: true },
  });

  let parsed;
  try {
    parsed = parseCustomerSalesWorkbook(
      Buffer.from(await file.arrayBuffer()),
      { caviarPrCodes: new Set(caviarProducts.map((p) => p.prCode)) }
    );
  } catch (error) {
    if (error instanceof CustomerSalesParseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const result = await applyCustomerSales(prisma, parsed, file.name);

  return Response.json({
    ok: true,
    mode: parsed.mode,
    rows: parsed.rows.length,
    customers: parsed.customers,
    years: parsed.years,
    months: parsed.mode === "replace-months" ? parsed.months : null,
    repsAdded: result.repsAdded,
  });
}
