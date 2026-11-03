import { describe, it, expect } from "vitest";
import { can } from "./permissions";

describe("group permissions", () => {
  it("only admins+ edit settings, add members, invite, pin", () => {
    for (const a of ["editSettings", "addMember", "invite", "pin"] as const) {
      expect([can("member", a), can("admin", a), can("owner", a)]).toEqual([false, true, true]);
    }
  });
  it("admins can remove members but not admins or the owner; owner can remove admins; nobody removes the owner", () => {
    expect(can("admin", "removeMember", "member")).toBe(true);
    expect(can("admin", "removeMember", "admin")).toBe(false);
    expect(can("admin", "removeMember", "owner")).toBe(false);
    expect(can("owner", "removeMember", "admin")).toBe(true);
    expect(can("owner", "removeMember", "owner")).toBe(false);
    expect(can("member", "removeMember", "member")).toBe(false);
  });
  it("only the owner changes roles or transfers ownership, never targeting the owner", () => {
    expect(can("owner", "setRole", "member")).toBe(true);
    expect(can("admin", "setRole", "member")).toBe(false);
    expect(can("owner", "setRole", "owner")).toBe(false);
    expect(can("owner", "transferOwner", "admin")).toBe(true);
    expect(can("admin", "transferOwner", "member")).toBe(false);
  });
  it("only the owner deletes; owner can't leave unless alone", () => {
    expect([can("member", "deleteGroup"), can("admin", "deleteGroup"), can("owner", "deleteGroup")]).toEqual([false, false, true]);
    expect(can("member", "leave")).toBe(true);
    expect(can("owner", "leave")).toBe(false);
    expect(can("owner", "leave", undefined, { onlyMember: true })).toBe(true);
  });
});
