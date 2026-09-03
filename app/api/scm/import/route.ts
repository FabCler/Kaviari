import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, isResponse } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { ImportParseError } from "@/lib/import/parse";
import { MAX_FILE_BYTES } from "@/lib/import/types";
import { readRows } from "@/lib/scm/import/rows";
import {
  DEMAND_COLUMNS,
  PO_COLUMNS,
  SO_COLUMNS,
} from "@/lib/scm/import/columns";
import {
  validateDemandRows,
  validatePoRows,
  validateSoRows,
  type PreparedImport,
} from "@/lib/scm/import/validate";
import {
  commitDemandImport,
  commitPoImport,
  commitSoImport,
} from "@/lib/scm/import/commit";

export const dynamic = "force-dynamic";

/**
 * Import in two steps (§1): POST a file to validate it, then POST the batch
 * id to commit. The validated rows are stored on the batch, so the user
 * confirms exactly what the validator saw.
 */

const KINDS = ["demand", "po", "so"] as const;
type Kind = (typeof KINDS)[number];

const REQUIRED: Record<Kind, readonly string[]> = {
  demand: ["productCode", "quantity", "deliveryDate"],
  po: ["poNumber", "supplierCode", "productCode", "quantity", "deliveryDate"],
  so: ["soNumber", "customerCode", "productCode", "quantity", "deliveryDate"],
};

const PERMISSION = {
  demand: "import.demand",
  po: "import.po",
  so: "import.so",
} as const;

const commitSchema = z.object({ batchId: z.string().min(1) });

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  // ---- step 2: commit a previously validated batch -----------------------
  if (contentType.includes("application/json")) {
    const parsed = commitSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: "A batch id is required." }, { status: 400 });
    }
    const batch = await prisma.scmImportBatch.findUnique({
      where: { id: parsed.data.batchId },
    });
    if (!batch) {
      return Response.json({ error: "Import batch not found." }, { status: 404 });
    }
    if (batch.status === "committed") {
      return Response.json(
        { error: "This file has already been imported." },
        { status: 409 }
      );
    }
    const kind = batch.kind as Kind;
    const actor = await requirePermission(PERMISSION[kind]);
    if (isResponse(actor)) return actor;

    const prepared = JSON.parse(batch.payload ?? "null") as PreparedImport<
      Record<string, unknown>
    > | null;
    if (!prepared) {
      return Response.json(
        { error: "The validated rows are no longer available — upload the file again." },
        { status: 410 }
      );
    }
    // Dates survive JSON as strings; revive them before committing.
    revive(prepared);

    const result =
      kind === "demand"
        ? await commitDemandImport(prepared as never, batch.fileName, actor)
        : kind === "po"
          ? await commitPoImport(prepared as never, batch.fileName, actor)
          : await commitSoImport(prepared as never, batch.fileName, actor);

    await prisma.scmImportBatch.update({
      where: { id: batch.id },
      data: { status: "committed", payload: null },
    });

    return Response.json({ ...result, kind });
  }

  // ---- step 1: parse + validate ------------------------------------------
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const rawKind = String(form?.get("kind") ?? "");
  if (!KINDS.includes(rawKind as Kind)) {
    return Response.json(
      { error: `Unknown import kind "${rawKind}".` },
      { status: 400 }
    );
  }
  const kind = rawKind as Kind;

  const actor = await requirePermission(PERMISSION[kind]);
  if (isResponse(actor)) return actor;
  if (!can(actor, PERMISSION[kind])) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }

  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: `The file is larger than ${Math.round(MAX_FILE_BYTES / 1_000_000)} MB.` },
      { status: 413 }
    );
  }

  try {
    const columns =
      kind === "demand"
        ? DEMAND_COLUMNS
        : kind === "po"
          ? PO_COLUMNS
          : SO_COLUMNS;
    const set = await readRows(
      file,
      columns as never,
      REQUIRED[kind] as never
    );

    if (set.missing.length > 0) {
      return Response.json(
        {
          error: `The file is missing required column(s): ${set.missing.join(", ")}.`,
          missing: set.missing,
          unmatchedHeaders: set.unmatchedHeaders,
        },
        { status: 422 }
      );
    }

    const prepared =
      kind === "demand"
        ? await validateDemandRows(set as never)
        : kind === "po"
          ? await validatePoRows(set as never)
          : await validateSoRows(set as never);

    const batch = await prisma.scmImportBatch.create({
      data: {
        kind,
        fileName: file.name,
        rowCount: prepared.rows.length,
        okCount: prepared.okCount,
        errorCount: prepared.errorCount,
        status: "validated",
        issues: JSON.stringify(
          prepared.rows
            .filter((row) => row.issues.length > 0)
            .map((row) => ({ row: row.rowNumber, issues: row.issues }))
            .slice(0, 500)
        ),
        payload: JSON.stringify(prepared),
        createdById: actor.id,
        createdByName: actor.name,
      },
    });

    return Response.json({
      batchId: batch.id,
      kind,
      fileName: file.name,
      sheetName: set.sheetName,
      ...prepared,
      // Keep the response light: the full rows are on the batch.
      rows: prepared.rows.slice(0, 300),
      truncated: prepared.rows.length > 300,
    });
  } catch (error) {
    if (error instanceof ImportParseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

/** JSON round-trip turns Dates into ISO strings; the committers need Dates. */
function revive(prepared: PreparedImport<Record<string, unknown>>): void {
  for (const row of prepared.rows) {
    if (!row.data) continue;
    for (const key of ["deliveryDate", "invoiceDate"]) {
      const value = row.data[key];
      if (typeof value === "string") row.data[key] = new Date(value);
    }
  }
}
