import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  AI_UNAVAILABLE_MESSAGE,
  completeText,
  isAiConfigured,
} from "@/lib/ai";
import { buildBusinessSummary } from "@/lib/data-summary";
import { formatDate } from "@/lib/format";

/**
 * Detailed AI-written reports, returned as a complete standalone HTML
 * document styled to match the app theme. The client opens it in a new
 * tab (Blob URL) for reading / printing / saving as PDF.
 */

const REPORT_TYPES = ["inventory", "consumption", "orders"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const bodySchema = z.object({
  type: z.enum(REPORT_TYPES),
  focus: z.string().trim().max(500).optional(),
});

const REPORT_TITLES: Record<ReportType, string> = {
  inventory: "Inventory Status Report",
  consumption: "Consumption & Forecast Report",
  orders: "Order Planning Report",
};

const REPORT_BRIEFS: Record<ReportType, string> = {
  inventory:
    "Write a detailed inventory status report: current stock position by product, " +
    "days of cover, lot-level detail with expiry risk (call out anything expiring soon " +
    "and what to do about it), slow movers and stock-out risks, plus a short executive " +
    "summary up front and clear recommendations at the end.",
  consumption:
    "Write a detailed consumption and forecast report: consumption over the recent " +
    "period by product and by channel, notable trends and seasonality, run-rate (ADU) " +
    "versus available stock, a forward-looking view of expected demand, and where the " +
    "data suggests forecasts should be adjusted. Executive summary up front, " +
    "recommendations at the end.",
  orders:
    "Write a detailed order planning report: what should be ordered in the next cycle " +
    "and why (per product: on hand, on order, run rate, days of cover, suggested " +
    "quantity), how open purchase orders affect the plan, timing versus the review " +
    "cycle and lead time, and risks (expiry, stock-outs, over-ordering). Executive " +
    "summary up front, a clear proposed order table, recommendations at the end.",
};

async function extraContext(type: ReportType, now: Date): Promise<string> {
  const lines: string[] = [];

  if (type === "inventory") {
    const lots = await prisma.stockLot.findMany({
      where: { quantityTins: { gt: 0 }, status: "in_stock" },
      include: { product: true },
      orderBy: { expiryDate: "asc" },
    });
    lines.push("## All in-stock lots (product | lot | units | received | expiry)");
    if (lots.length === 0) lines.push("None.");
    for (const lot of lots) {
      lines.push(
        `${lot.product.name} | ${lot.lotNumber} | ${lot.quantityTins} | ` +
          `${formatDate(lot.receivedDate)} | ${formatDate(lot.expiryDate)}`
      );
    }
  }

  if (type === "consumption") {
    const since = new Date(now.getTime() - 90 * 86_400_000);
    const [byProduct, forecasts] = await Promise.all([
      prisma.stockMovement.groupBy({
        by: ["productId"],
        where: {
          type: { in: ["consumption", "sale", "marketing_sample"] },
          date: { gte: since },
        },
        _sum: { quantityTins: true, gramsEquivalent: true },
      }),
      prisma.forecast.findMany({
        where: { month: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        include: { product: true },
        orderBy: { month: "asc" },
      }),
    ]);
    const products = await prisma.product.findMany({
      where: { id: { in: byProduct.map((r) => r.productId) } },
    });
    const nameOf = new Map(products.map((p) => [p.id, p.name]));
    lines.push("## Consumption by product, last 90 days (units, kg reference)");
    if (byProduct.length === 0) lines.push("None.");
    for (const row of byProduct) {
      lines.push(
        `${nameOf.get(row.productId) ?? row.productId}: ` +
          `${Math.abs(row._sum.quantityTins ?? 0).toFixed(0)} units ` +
          `(${(Math.abs(row._sum.gramsEquivalent ?? 0) / 1000).toFixed(1)} kg)`
      );
    }
    lines.push("");
    lines.push("## Uploaded demand forecasts (product | month | forecast units)");
    if (forecasts.length === 0) lines.push("None uploaded.");
    for (const f of forecasts) {
      lines.push(
        `${f.product.name} | ${formatDate(f.month)} | ${f.quantity}`
      );
    }
  }

  if (type === "orders") {
    const pos = await prisma.purchaseOrder.findMany({
      orderBy: { orderDate: "desc" },
      take: 8,
      include: { lines: { include: { product: true } } },
    });
    lines.push("## Recent purchase orders (newest first)");
    if (pos.length === 0) lines.push("None.");
    for (const po of pos) {
      const items = po.lines
        .map((l) => `${l.product.name} × ${l.quantityTins}`)
        .join(", ");
      lines.push(
        `${po.reference} (${po.status}), ordered ${formatDate(po.orderDate)}, ` +
          `ETA ${formatDate(po.expectedDeliveryDate)}: ${items}`
      );
    }
  }

  return lines.join("\n");
}

const REPORT_SYSTEM =
  "You are a senior inventory and operations analyst writing a formal report for the " +
  "management of a premium seafood business that stocks Kaviari Paris caviar. " +
  "Write in professional, precise English. Base every figure strictly on the data " +
  "provided — never invent numbers. Quantities are in tins/units and grams; money is " +
  "in the given currency.\n\n" +
  "Return ONLY an HTML fragment (no <html>, <head>, <body>, no markdown, no code " +
  "fences) using exactly these tags: <h2>, <h3>, <p>, <ul>, <li>, <table>, <thead>, " +
  "<tbody>, <tr>, <th>, <td>, <strong>, <em>. Structure: start with an " +
  '<h2>Executive summary</h2> section (3-6 bullet points), then 3-5 substantive ' +
  "sections with tables where tabular data helps, and finish with an " +
  "<h2>Recommendations</h2> section of concrete, prioritised actions. " +
  "Be thorough and detailed — this is a full report, not a chat reply.";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep only the allowed markup in case the model wraps or fences its answer. */
function cleanFragment(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/<\/?(?:html|head|body|!doctype)[^>]*>/gi, "")
    .trim();
}

function wrapDocument(options: {
  title: string;
  subtitle: string;
  body: string;
  generatedAt: Date;
}): string {
  const generated = options.generatedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)} — Kaviari Cellar</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f7f5f0;
    color: #171a20;
    font: 15px/1.6 "Georgia", "Times New Roman", serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 51rem; margin: 0 auto; padding: 0 1.5rem 3rem; }
  header.band {
    background: #0f192b;
    color: #f7f5f0;
    border-bottom: 3px solid #c9a227;
    padding: 2.25rem 1.5rem 1.75rem;
  }
  header.band .inner { max-width: 51rem; margin: 0 auto; }
  .brand {
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c9a227;
    margin: 0 0 0.6rem;
    font-family: "Helvetica Neue", Arial, sans-serif;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
    font-weight: 600;
    line-height: 1.2;
    font-family: "Cormorant Garamond", "Georgia", serif;
  }
  .meta {
    margin: 0.6rem 0 0;
    font-size: 0.85rem;
    color: #d6d2c6;
    font-family: "Helvetica Neue", Arial, sans-serif;
  }
  main { padding-top: 2rem; }
  h2 {
    font-family: "Cormorant Garamond", "Georgia", serif;
    font-size: 1.45rem;
    font-weight: 600;
    color: #0f192b;
    border-bottom: 1px solid #e3dfd2;
    padding-bottom: 0.35rem;
    margin: 2.2rem 0 0.9rem;
  }
  h2:first-child { margin-top: 0; }
  h3 {
    font-family: "Cormorant Garamond", "Georgia", serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: #1e2f4f;
    margin: 1.6rem 0 0.5rem;
  }
  p { margin: 0.6rem 0; }
  ul { margin: 0.6rem 0; padding-left: 1.4rem; }
  li { margin: 0.3rem 0; }
  strong { color: #0f192b; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0 1.4rem;
    font-size: 0.86rem;
    background: #fffefb;
    font-family: "Helvetica Neue", Arial, sans-serif;
  }
  th {
    background: #0f192b;
    color: #e8d5a3;
    text-align: left;
    font-weight: 600;
    padding: 0.5rem 0.7rem;
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  td { padding: 0.45rem 0.7rem; border-bottom: 1px solid #e3dfd2; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f3f0e8; }
  .focus-note {
    background: #f3ead3;
    border-left: 3px solid #c9a227;
    padding: 0.7rem 1rem;
    margin: 0 0 1.4rem;
    font-size: 0.9rem;
    color: #5c4a10;
  }
  footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid #e3dfd2;
    text-align: center;
    font-size: 0.8rem;
    color: #6d6f74;
    font-family: "Helvetica Neue", Arial, sans-serif;
  }
  footer .rule { color: #c9a227; letter-spacing: 0.3em; margin-bottom: 0.4rem; }
  @page { size: A4; margin: 14mm 12mm; }
  @media print {
    body { background: #ffffff; }
    header.band { padding: 1.5rem 0 1.2rem; }
    .page { max-width: none; padding: 0; }
    h2 { break-after: avoid; }
    table, .focus-note { break-inside: avoid; }
  }
</style>
</head>
<body>
<header class="band">
  <div class="inner">
    <p class="brand">Kaviari Cellar</p>
    <h1>${escapeHtml(options.title)}</h1>
    <p class="meta">${escapeHtml(options.subtitle)}</p>
  </div>
</header>
<div class="page">
<main>
${options.body}
</main>
<footer>
  <div class="rule">◆ ◆ ◆</div>
  Kaviari Cellar — generated ${escapeHtml(generated)}
</footer>
</div>
</body>
</html>`;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  if (!isAiConfigured()) {
    return Response.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { type, focus } = parsed.data;

  try {
    const now = new Date();
    const [summary, extra] = await Promise.all([
      buildBusinessSummary(now),
      extraContext(type, now),
    ]);

    const prompt =
      `${REPORT_BRIEFS[type]}\n\n` +
      (focus ? `The reader asked for particular focus on: ${focus}\n\n` : "") +
      `Business data:\n\n${summary}\n\n${extra}`;

    const fragment = await completeText({
      system: REPORT_SYSTEM,
      prompt,
      maxTokens: 6000,
    });

    const focusBlock = focus
      ? `<p class="focus-note"><strong>Focus:</strong> ${escapeHtml(focus)}</p>\n`
      : "";
    const html = wrapDocument({
      title: REPORT_TITLES[type],
      subtitle: `Prepared for ${user.name} · Data as of ${formatDate(now)}`,
      body: focusBlock + cleanFragment(fragment),
      generatedAt: now,
    });

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return Response.json(
      { error: "The report could not be generated. Please try again." },
      { status: 502 }
    );
  }
}
