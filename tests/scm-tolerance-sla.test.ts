import { describe, expect, it } from "vitest";
import { ToleranceResolver, toleranceKey } from "@/lib/scm/tolerance";
import {
  daysBetween,
  dueDateFor,
  slaSortKey,
  slaState,
} from "@/lib/scm/sla";

const RULES = [
  {
    scope: "global",
    supplierId: null,
    channelId: null,
    productType: null,
    qtyTolerancePct: 0,
    priceTolerancePct: 0,
    weightTolerancePct: 0,
  },
  {
    scope: "product_type",
    supplierId: null,
    channelId: null,
    productType: "Caviar",
    qtyTolerancePct: 1,
    priceTolerancePct: 1,
    weightTolerancePct: 1,
  },
  {
    scope: "channel",
    supplierId: null,
    channelId: "str",
    productType: null,
    qtyTolerancePct: 5,
    priceTolerancePct: 1,
    weightTolerancePct: 5,
  },
  {
    scope: "supplier",
    supplierId: "norsea",
    channelId: null,
    productType: null,
    qtyTolerancePct: 2,
    priceTolerancePct: 0,
    weightTolerancePct: 5,
  },
];

describe("tolerance resolution (§28)", () => {
  const resolver = new ToleranceResolver(RULES);

  it("falls back to the global rule", () => {
    const rule = resolver.resolve({});
    expect(rule.qtyTolerancePct).toBe(0);
    expect(rule.source).toBe("Global rule");
  });

  it("uses the product type when nothing narrower matches", () => {
    const rule = resolver.resolve({ productType: "Caviar" });
    expect(rule.qtyTolerancePct).toBe(1);
    expect(rule.source).toBe("Product type rule");
  });

  it("prefers the channel over the product type", () => {
    const rule = resolver.resolve({ channelId: "str", productType: "Caviar" });
    expect(rule.qtyTolerancePct).toBe(5);
    expect(rule.source).toBe("Channel rule");
  });

  it("prefers the supplier over everything else", () => {
    // The supplier is the narrowest scope: a fussy supplier is held to its
    // own numbers even inside a channel that is otherwise relaxed.
    const rule = resolver.resolve({
      supplierId: "norsea",
      channelId: "str",
      productType: "Caviar",
    });
    expect(rule.qtyTolerancePct).toBe(2);
    expect(rule.source).toBe("Supplier rule");
  });

  it("builds one key per scope target", () => {
    expect(toleranceKey("global", null)).toBe("global:*");
    expect(toleranceKey("supplier", "norsea")).toBe("supplier:norsea");
    expect(toleranceKey("channel", "str")).toBe("channel:str");
  });

  it("returns the default when there is no rule at all", () => {
    const empty = new ToleranceResolver([]);
    expect(empty.resolve({ supplierId: "x" }).qtyTolerancePct).toBe(0);
  });
});

describe("SLA control (§27)", () => {
  const now = new Date("2026-04-10T09:00:00Z");

  it("counts whole days regardless of the time of day", () => {
    expect(daysBetween(now, new Date("2026-04-13T23:00:00Z"))).toBe(3);
    expect(daysBetween(now, new Date("2026-04-10T01:00:00Z"))).toBe(0);
  });

  it("is on track well before the due date", () => {
    const state = slaState(new Date("2026-04-20T12:00:00Z"), { now });
    expect(state.status).toBe("on_track");
    expect(state.remainingDays).toBe(10);
  });

  it("warns inside the due-soon window", () => {
    const state = slaState(new Date("2026-04-12T12:00:00Z"), { now });
    expect(state.status).toBe("due_soon");
    expect(state.label).toBe("Due in 2 days");
  });

  it("says due today on the day itself", () => {
    expect(slaState(new Date("2026-04-10T18:00:00Z"), { now }).label).toBe(
      "Due today"
    );
  });

  it("reports how late an overdue item is", () => {
    const state = slaState(new Date("2026-04-07T12:00:00Z"), { now });
    expect(state.status).toBe("overdue");
    expect(state.remainingDays).toBe(-3);
    expect(state.label).toBe("Overdue by 3 days");
  });

  it("is completed once the work is done, whatever the date", () => {
    expect(
      slaState(new Date("2026-04-01T12:00:00Z"), { now, done: true }).status
    ).toBe("completed");
  });

  it("has no due date when none was set", () => {
    expect(slaState(null, { now }).remainingDays).toBeNull();
  });

  it("sorts overdue first, then by priority, then by how soon it is due", () => {
    const overdue = { sla: slaState(new Date("2026-04-08"), { now }), priority: "low" };
    const dueSoonCritical = {
      sla: slaState(new Date("2026-04-11"), { now }),
      priority: "critical",
    };
    const dueSoonLow = {
      sla: slaState(new Date("2026-04-11"), { now }),
      priority: "low",
    };
    const onTrack = { sla: slaState(new Date("2026-05-01"), { now }), priority: "high" };

    const sorted = [onTrack, dueSoonLow, dueSoonCritical, overdue].sort(
      (a, b) => slaSortKey(a) - slaSortKey(b)
    );
    expect(sorted[0]).toBe(overdue);
    expect(sorted[1]).toBe(dueSoonCritical);
    expect(sorted[2]).toBe(dueSoonLow);
    expect(sorted[3]).toBe(onTrack);
  });

  it("counts a step's due date back from the delivery date", () => {
    const delivery = new Date("2026-04-20T12:00:00Z");
    expect(dueDateFor(delivery, "salesReview", now).toISOString().slice(0, 10)).toBe(
      "2026-04-18"
    );
    expect(dueDateFor(delivery, "receiving", now).toISOString().slice(0, 10)).toBe(
      "2026-04-20"
    );
  });

  it("never hands someone a due date already behind them", () => {
    const delivery = new Date("2026-04-10T12:00:00Z");
    expect(dueDateFor(delivery, "salesReview", now).getTime()).toBe(now.getTime());
  });
});
