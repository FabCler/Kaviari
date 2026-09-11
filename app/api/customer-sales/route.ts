import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  CustomerSalesParseError,
  parseCustomerSalesWorkbook,
} from "@/lib/customer-sales/parse";
import { MAX_FILE_BYTES } from "@/lib/import/types";

/**
 * POST /api/customer-sales — multipart/form-data { file }.
 * Replaces the whole customer-sales table with the uploaded "Top 90% sales"
 * pivot export (the file is a full snapshot, re-exported twice a month).
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

  let parsed;
  try {
    parsed = parseCustomerSalesWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof CustomerSalesParseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const meta = JSON.stringify({
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    rows: parsed.rows.length,
  });
  await prisma.$transaction([
    prisma.customerSale.deleteMany(),
    prisma.customerSale.createMany({ data: parsed.rows }),
    prisma.setting.upsert({
      where: { key: "customerSalesMeta" },
      create: { key: "customerSalesMeta", value: meta },
      update: { value: meta },
    }),
  ]);

  return Response.json({
    ok: true,
    rows: parsed.rows.length,
    customers: parsed.customers,
    years: parsed.years,
  });
}
