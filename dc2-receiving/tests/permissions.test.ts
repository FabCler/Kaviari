import { describe, expect, it } from "vitest";
import { canResolve, canSee, sectionsFor } from "@/lib/permissions";

const member = (department: string) => ({
  role: "member",
  department,
  status: "approved",
});

describe("what a department opens", () => {
  it("gives DC2 the release list and nothing else", () => {
    expect(sectionsFor(member("Warehouse DC2"))).toEqual(["dashboard", "receiving"]);
    expect(canSee(member("Warehouse DC2"), "imports")).toBe(false);
  });

  it("gives Purchasing the documents and the item master", () => {
    expect(canSee(member("Purchasing"), "imports")).toBe(true);
    expect(canSee(member("Purchasing"), "items")).toBe(true);
    expect(canSee(member("Purchasing"), "soadjust")).toBe(false);
  });

  it("gives Customer Service the allocation screens", () => {
    expect(canSee(member("Customer Service"), "soadjust")).toBe(true);
    expect(canSee(member("Customer Service"), "receiving")).toBe(false);
  });

  it("never gives a member the user list", () => {
    expect(canSee(member("Sales"), "users")).toBe(false);
    expect(canSee({ role: "admin", department: "Sales", status: "approved" }, "users")).toBe(true);
  });

  it("falls back to the dashboard when no department is set", () => {
    expect(sectionsFor(member(""))).toEqual(["dashboard"]);
  });
});

describe("who clears which exception", () => {
  it("only the desk that owns it", () => {
    expect(canResolve(member("Purchasing"), "Purchasing")).toBe(true);
    expect(canResolve(member("Sales"), "Purchasing")).toBe(false);
  });

  it("Sales and Customer Service share the ones marked Sales/CS", () => {
    expect(canResolve(member("Sales"), "Sales/CS")).toBe(true);
    expect(canResolve(member("Customer Service"), "Sales/CS")).toBe(true);
    expect(canResolve(member("Warehouse DC2"), "Sales/CS")).toBe(false);
  });

  it("an administrator can act for any desk", () => {
    expect(
      canResolve({ role: "admin", department: "Warehouse DC2", status: "approved" }, "Purchasing")
    ).toBe(true);
  });
});
