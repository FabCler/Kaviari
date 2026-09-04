import { describe, expect, it } from "vitest";
import {
  proposeShortageSplit,
  validateShortageDecision,
  type ChannelDemand,
} from "@/lib/osms/shortage";

/** The §45 example: 2,000 KG ordered across four channels. */
const DEMAND: ChannelDemand[] = [
  {
    channelId: "fs",
    channelCode: "FS",
    channelName: "Food Service",
    defaultPriority: 10,
    soLineId: "so-fs",
    soNumber: "SO001",
    customerId: "c1",
    customerName: "Customer A",
    requestedQuantity: 1000,
  },
  {
    channelId: "rtl",
    channelCode: "RTL",
    channelName: "Retail",
    defaultPriority: 20,
    soLineId: "so-rtl",
    soNumber: "SO002",
    customerId: "c2",
    customerName: "Customer C",
    requestedQuantity: 500,
  },
  {
    channelId: "str",
    channelCode: "STR",
    channelName: "Store",
    defaultPriority: 30,
    soLineId: "so-str",
    soNumber: "SO003",
    customerId: "c3",
    customerName: "Store 001",
    requestedQuantity: 300,
  },
  {
    channelId: "ck",
    channelCode: "CK",
    channelName: "Central Kitchen",
    defaultPriority: 40,
    soLineId: "so-ck",
    soNumber: "SO004",
    customerId: "c4",
    customerName: "Central Kitchen 001",
    requestedQuantity: 200,
  },
];

function bySoLine(lines: ReturnType<typeof proposeShortageSplit>) {
  return new Map(lines.map((line) => [line.soLineId, line.proposedQuantity]));
}

describe("cross-channel shortage proposal (§20, §45)", () => {
  it("serves every channel in full when the delivery covers the demand", () => {
    const split = bySoLine(proposeShortageSplit(2000, DEMAND));
    expect(split.get("so-fs")).toBe(1000);
    expect(split.get("so-rtl")).toBe(500);
    expect(split.get("so-str")).toBe(300);
    expect(split.get("so-ck")).toBe(200);
  });

  it("serves higher-priority channels first and cuts the last one", () => {
    // 1,700 available: FS + RTL + STR = 1,800, so CK gets nothing and Store
    // absorbs the rest of the shortfall.
    const split = bySoLine(proposeShortageSplit(1700, DEMAND));
    expect(split.get("so-fs")).toBe(1000);
    expect(split.get("so-rtl")).toBe(500);
    expect(split.get("so-str")).toBe(200);
    expect(split.get("so-ck")).toBe(0);
  });

  it("always proposes exactly what arrived", () => {
    for (const actual of [1700, 1234.5, 900, 100]) {
      const total = proposeShortageSplit(actual, DEMAND).reduce(
        (sum, line) => sum + line.proposedQuantity,
        0
      );
      expect(Math.round(total * 10000) / 10000).toBe(actual);
    }
  });

  it("shares pro-rata inside one priority band", () => {
    const sameBand = DEMAND.map((demand) => ({ ...demand, defaultPriority: 10 }));
    // 1,000 against 2,000 of demand at equal priority: everyone gets half.
    const split = bySoLine(proposeShortageSplit(1000, sameBand));
    expect(split.get("so-fs")).toBe(500);
    expect(split.get("so-rtl")).toBe(250);
    expect(split.get("so-str")).toBe(150);
    expect(split.get("so-ck")).toBe(100);
  });

  it("reports the reduction each channel absorbs", () => {
    const lines = proposeShortageSplit(1700, DEMAND);
    const ck = lines.find((line) => line.channelCode === "CK")!;
    expect(ck.reduction).toBe(200);
    const fs = lines.find((line) => line.channelCode === "FS")!;
    expect(fs.reduction).toBe(0);
  });
});

describe("shortage decision validation", () => {
  const lines = [
    { requestedQuantity: 1000, approvedQuantity: 900 },
    { requestedQuantity: 500, approvedQuantity: 400 },
    { requestedQuantity: 300, approvedQuantity: 250 },
    { requestedQuantity: 200, approvedQuantity: 150 },
  ];

  it("accepts a split that adds up to what arrived", () => {
    // The spec's own worked answer: 900 + 400 + 250 + 150 = 1,700.
    const result = validateShortageDecision(1700, lines);
    expect(result.ok).toBe(true);
    expect(result.approvedTotal).toBe(1700);
    expect(result.unassigned).toBe(0);
  });

  it("refuses a split that leaves quantity unassigned", () => {
    const result = validateShortageDecision(1800, lines);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("still unassigned");
  });

  it("refuses to hand out more than arrived", () => {
    const result = validateShortageDecision(1600, lines);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Over-assigned");
  });

  it("refuses to promise a customer more than they ordered", () => {
    const result = validateShortageDecision(1700, [
      { requestedQuantity: 1000, approvedQuantity: 1200 },
      { requestedQuantity: 500, approvedQuantity: 300 },
      { requestedQuantity: 300, approvedQuantity: 100 },
      { requestedQuantity: 200, approvedQuantity: 100 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("more than the 1000 ordered");
  });

  it("refuses a decision that skips a channel entirely", () => {
    const result = validateShortageDecision(1700, [
      ...lines.slice(0, 3),
      { requestedQuantity: 200, approvedQuantity: null },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("decide a quantity for every channel");
  });
});
