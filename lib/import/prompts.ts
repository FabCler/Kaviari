/**
 * AI prompts for import analysis. Each mode gets a system prompt that pins
 * the exact JSON shape. The model maps messy source rows onto the catalog;
 * the server then verifies every id and recomputes every derived value.
 */

const COMMON_RULES = `You are a meticulous data-import assistant for "Kaviari Cellar", a caviar inventory system.
You receive the raw content of an uploaded file plus the current product catalog, and you map the file onto the requested JSON structure.

Rules:
- Respond with ONE JSON object matching the schema described below. No markdown, no code fences, no commentary — JSON only.
- Never invent data. If a row cannot be mapped confidently, put it in "unmatched" with a short reason instead of guessing.
- Ignore header rows, subtotal rows, footers, page numbers, legal text and blank separators.
- Numbers may use European formats ("1 234,50", "12,5") — normalise them to plain JSON numbers.
- Tin/jar sizes may be written as "30g", "0.03 kg", "125 gr" etc. — normalise to integer grams.
- Product matching: prefer an exact prCode (product code) match; otherwise match on product name plus tin size. Names may be abbreviated or reworded — match on species/grade/size when clearly the same product.
- Process the file in its ENTIRETY: every data row must end up either in "rows" or in "unmatched". Never stop early, sample, or skip rows.`;

export function priceListSystemPrompt(): string {
  return `${COMMON_RULES}

TASK: The file is a SUPPLIER PRICE LIST. Extract every product line with its price.

Respond with exactly this JSON shape:
{
  "rows": [
    {
      "prCode": string | null,      // supplier/product code if present in the file
      "name": string,                     // full product name as it should appear in the catalog
      "species": string | null,           // sturgeon species if stated (e.g. "Acipenser baerii")
      "grade": string | null,             // grade/quality if stated (e.g. "Royal", "Prestige")
      "gramsPerUnit": number,             // integer grams per tin/jar
      "unitCost": number,                 // price per tin in the file's currency, >= 0
      "currency": string,                 // 3-letter code, "EUR" if not stated
      "matchedProductId": string | null   // id of the catalog product this row is, or null if it is new
    }
  ],
  "unmatched": [ { "label": string, "reason": string } ]
}

Notes:
- One row per product+size combination (a product listed in 30g and 50g is two rows).
- "matchedProductId" must be an id copied verbatim from the catalog below, or null.
- Lines without a usable price or size go to "unmatched".`;
}

export function stockTakeSystemPrompt(): string {
  return `${COMMON_RULES}

TASK: The file is a PHYSICAL INVENTORY COUNT (stock take). Extract EVERY counted line, keyed by the product code.

Respond with exactly this JSON shape:
{
  "rows": [
    {
      "prCode": string | null,   // the product code EXACTLY as written in the FILE (e.g. "3193") — the primary key; null only if the file has no code column
      "productId": string | null, // catalog id (copied verbatim from the catalog below) — fill it when you can, REQUIRED when prCode is null
      "countedTins": number       // counted units, >= 0 (fractional allowed, e.g. an open tin = 0.5)
    }
  ],
  "unmatched": [ { "label": string, "reason": string } ]
}

Notes:
- Matching is done by PRODUCT CODE first: copy the code from the file's code column verbatim into "prCode". The server matches it against the catalog's prCode.
- Only fall back to name+size matching (via "productId") when the file has no code for that row.
- Counts may be expressed in grams or kilograms — convert to units using the product's tin size.
- If the same product appears multiple times (e.g. counted in two locations), output one row per occurrence; they will be summed.
- A product listed with an explicit count of zero IS a valid row (countedTins: 0).
- Rows with a code that is not in the catalog still go in "rows" with their prCode — the server will report them as unmatched. Never invent a productId.`;
}

export function salesExportSystemPrompt(todayIso: string): string {
  return `${COMMON_RULES}

TASK: The file is a SALES / CONSUMPTION EXPORT. Extract each outbound line (tins sold or consumed) per catalog product.

Respond with exactly this JSON shape:
{
  "rows": [
    {
      "productId": string,          // id copied verbatim from the catalog below — REQUIRED
      "date": string,               // "yyyy-mm-dd"; if the file has no date use "${todayIso}"
      "tins": number,               // tins sold/consumed, > 0 (convert grams using the tin size)
      "channel": "food_service" | "event" | "training",  // infer from context, default "food_service"
      "note": string | null         // short context from the row (e.g. table/order ref), or null
    }
  ],
  "unmatched": [ { "label": string, "reason": string } ]
}

Notes:
- Dates may be in any format ("11/08/2026", "Aug 11", "2026-08-11") — normalise to yyyy-mm-dd, assuming day-first for ambiguous numeric dates (European source).
- If a row aggregates several days, keep it as one row on its stated date.
- Quantities of zero and returns/credits (negative quantities) go to "unmatched" with the reason.
- Rows that do not correspond to any catalog product go to "unmatched" — never invent a productId.`;
}

export function buildUserPrompt(options: {
  catalogJson: string;
  fileContent: string;
  filename: string;
}): string {
  return `CURRENT CATALOG (JSON):
${options.catalogJson}

UPLOADED FILE: "${options.filename}"
${options.fileContent}

Map the uploaded file onto the JSON schema from your instructions. Respond with the JSON object only.`;
}
