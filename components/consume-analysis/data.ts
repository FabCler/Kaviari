import { prisma } from "@/lib/db";
import { DEMAND_MOVEMENT_TYPES } from "@/lib/domain";
import { shortProductName } from "@/lib/format";
import { monthKeyOf, round2 } from "@/components/consume-analysis/aggregate";
import type { AnalysisData } from "@/components/consume-analysis/types";

/**
 * SERVER-ONLY loader for the consumption analysis screen. Used by both the
 * page (server component) and POST /api/exports/consumption so the exported
 * workbook is rebuilt from the same data the view was rendered from.
 * Client components must import types from ./types, never this module.
 */
export async function loadAnalysisData(now: Date = new Date()): Promise<AnalysisData> {
  // Enough history for the largest window (12 months, aligned to month start).
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [products, movements, forecasts] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { movements: { some: {} } },
          { lots: { some: { quantityTins: { gt: 0 } } } },
          { forecasts: { some: {} } },
        ],
      },
      select: {
        id: true,
        prCode: true,
        name: true,
        caviarType: true,
        category: true,
        unit: true,
        gramsPerUnit: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.stockMovement.findMany({
      where: {
        type: { in: [...DEMAND_MOVEMENT_TYPES] },
        date: { gte: from },
        product: { active: true },
      },
      select: {
        productId: true,
        quantityTins: true,
        gramsEquivalent: true,
        date: true,
      },
    }),
    prisma.forecast.findMany({
      select: {
        userId: true,
        productId: true,
        month: true,
        quantity: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const people = new Map<string, string>();
  for (const f of forecasts) people.set(f.userId, f.user.name);

  return {
    products: products.map((p) => ({
      id: p.id,
      prCode: p.prCode,
      name: p.name,
      shortName: shortProductName(p.name),
      caviarType: p.caviarType,
      category: p.category,
      unit: p.unit,
      gramsPerUnit: p.gramsPerUnit,
    })),
    // Demand movements are stored negative; flip the sign once here.
    movements: movements.map((m) => ({
      productId: m.productId,
      date: m.date.toISOString(),
      units: round2(Math.max(0, -m.quantityTins)),
      grams: round2(Math.max(0, -m.gramsEquivalent)),
    })),
    forecasts: forecasts.map((f) => ({
      userId: f.userId,
      userName: f.user.name,
      productId: f.productId,
      month: monthKeyOf(f.month),
      quantity: f.quantity,
    })),
    people: [...people.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
