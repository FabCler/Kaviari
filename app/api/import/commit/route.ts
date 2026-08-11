import { requireAuth } from "@/lib/auth";
import { commitSchema, summarizeIssues } from "@/lib/import/schemas";
import {
  commitPriceList,
  commitSalesExport,
  commitStockTake,
} from "@/lib/import/commit";
import type { CommitResult } from "@/lib/import/types";

export const maxDuration = 60;

/**
 * POST /api/import/commit — writes a previously previewed import.
 * The payload is fully re-validated: every product id is checked against the
 * DB and every derived quantity (system stock, deltas, FEFO allocation) is
 * recomputed server-side inside one transaction.
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

  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "The import payload is invalid.",
        issues: summarizeIssues(parsed.error.issues),
      },
      { status: 400 }
    );
  }

  try {
    let result: CommitResult;
    switch (parsed.data.mode) {
      case "price_list":
        result = await commitPriceList(parsed.data.rows);
        break;
      case "stock_take":
        result = await commitStockTake(parsed.data.rows);
        break;
      case "sales_export":
        result = await commitSalesExport(parsed.data.rows);
        break;
    }
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("Import commit failed", error);
    return Response.json(
      { error: "The import could not be written. Nothing was saved — please try again." },
      { status: 500 }
    );
  }
}
