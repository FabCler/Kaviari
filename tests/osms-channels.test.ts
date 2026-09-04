import { describe, expect, it } from "vitest";
import {
  canSeeChannel,
  channelWhere,
  narrowScope,
  type ChannelScope,
} from "@/lib/osms/channels";
import { can, isSalesManager, permissionMatrix } from "@/lib/osms/permissions";

const CHANNELS = [
  { id: "fs", code: "FS", name: "Food Service", nameTh: null, sortOrder: 1, defaultPriority: 10 },
  { id: "rtl", code: "RTL", name: "Retail", nameTh: null, sortOrder: 2, defaultPriority: 20 },
];

const ALL: ChannelScope = { all: true, ids: ["fs", "rtl"], channels: CHANNELS };
const FS_ONLY: ChannelScope = { all: false, ids: ["fs"], channels: [CHANNELS[0]] };
const NONE: ChannelScope = { all: false, ids: [], channels: [] };

describe("channel scoping (§39)", () => {
  it("does not filter for a user who sees everything", () => {
    expect(channelWhere(ALL)).toBeUndefined();
  });

  it("restricts a scoped user to their channels", () => {
    expect(channelWhere(FS_ONLY)).toEqual({ in: ["fs"] });
  });

  it("matches nothing for a user with no channel — never everything", () => {
    // The dangerous failure mode is an empty scope reading as "no filter".
    expect(channelWhere(NONE)).toEqual({ in: [] });
  });

  it("honours a requested channel inside the scope", () => {
    expect(channelWhere(FS_ONLY, "fs")).toBe("fs");
    expect(channelWhere(ALL, "rtl")).toBe("rtl");
  });

  it("returns nothing when a scoped user asks for a channel they cannot see", () => {
    expect(channelWhere(FS_ONLY, "rtl")).toEqual({ in: [] });
  });

  it("narrows to the requested channel when it is inside the scope", () => {
    const narrowed = narrowScope(ALL, "rtl");
    expect(narrowed.all).toBe(false);
    expect(narrowed.ids).toEqual(["rtl"]);
  });

  it("collapses to nothing when the requested channel is out of scope", () => {
    // The leak this guards: a Retail user adding ?channel=<FS> to the URL
    // must see nothing, not the unscoped view.
    const narrowed = narrowScope(FS_ONLY, "rtl");
    expect(narrowed.all).toBe(false);
    expect(narrowed.ids).toEqual([]);
    expect(channelWhere(narrowed)).toEqual({ in: [] });
  });

  it("leaves the scope untouched when no channel is requested", () => {
    expect(narrowScope(FS_ONLY, undefined)).toBe(FS_ONLY);
    expect(narrowScope(ALL, null)).toBe(ALL);
  });

  it("decides visibility for an in-memory row the same way", () => {
    expect(canSeeChannel(ALL, "rtl")).toBe(true);
    expect(canSeeChannel(FS_ONLY, "fs")).toBe(true);
    expect(canSeeChannel(FS_ONLY, "rtl")).toBe(false);
    expect(canSeeChannel(FS_ONLY, null)).toBe(false);
    expect(canSeeChannel(ALL, null)).toBe(true);
  });
});

describe("permissions with channels (§4, §39)", () => {
  const salesUser = {
    role: "member",
    department: "sales",
    allChannels: false,
  };
  const salesManager = { role: "member", department: "sales", allChannels: true };
  const warehouse = { role: "member", department: "warehouse", allChannels: false };
  const management = { role: "member", department: "management", allChannels: false };
  const owner = { role: "owner", department: "none", allChannels: false };

  it("lets sales review and allocate but not create a PO", () => {
    expect(can(salesUser, "sales.reviewDifference")).toBe(true);
    expect(can(salesUser, "sales.allocate")).toBe(true);
    expect(can(salesUser, "purchasing.createPo")).toBe(false);
  });

  it("keeps cross-channel shortage approval away from a channel sales user", () => {
    // Ranking channels against each other is not a decision one channel's
    // owner may make for the others (§20).
    expect(can(salesUser, "shortage.approve")).toBe(false);
  });

  it("gives a sales manager the shortage approval", () => {
    expect(isSalesManager(salesManager)).toBe(true);
    expect(can(salesManager, "shortage.approve")).toBe(true);
  });

  it("gives management the shortage approval too", () => {
    expect(can(management, "shortage.approve")).toBe(true);
  });

  it("lets the warehouse see every channel and move stock", () => {
    expect(can(warehouse, "warehouse.receive")).toBe(true);
    expect(can(warehouse, "warehouse.stock")).toBe(true);
    expect(can(warehouse, "shortage.approve")).toBe(false);
  });

  it("keeps management read-only on the operational screens", () => {
    expect(can(management, "purchasing.view")).toBe(true);
    expect(can(management, "purchasing.createPo")).toBe(false);
    expect(can(management, "warehouse.receive")).toBe(false);
    expect(can(management, "audit.view")).toBe(true);
  });

  it("makes the owner an admin whatever their department", () => {
    expect(can(owner, "master.manage")).toBe(true);
    expect(can(owner, "channels.manage")).toBe(true);
    expect(can(owner, "override")).toBe(true);
  });

  it("exposes a sales-manager column in the matrix", () => {
    const row = permissionMatrix().find(
      (entry) => entry.permission === "shortage.approve"
    )!;
    expect(row.sales).toBe(false);
    expect(row.salesManager).toBe(true);
    expect(row.management).toBe(true);
  });
});
