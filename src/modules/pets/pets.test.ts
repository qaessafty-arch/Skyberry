import { describe, it, expect } from "vitest";
import { validEquip, validHome, unlockedRewards } from "./catalog";
import { pickStarterPet } from "./starter";

describe("pet catalog validation", () => {
  it("free items always allowed; locked items need the milestone", () => {
    expect(validEquip(["bow"], [])).toBe(true);
    expect(validEquip(["sunglasses"], [])).toBe(false);
    expect(validEquip(["sunglasses"], ["growing-together"])).toBe(true);
    expect(validEquip(["not-a-thing"], ["eternal-ocean"])).toBe(false);
  });
  it("crown requires evolution stage 3", () => {
    expect(validEquip(["crown"], [], 2)).toBe(false);
    expect(validEquip(["crown"], [], 3)).toBe(true);
  });
  it("homes unlock from milestones", () => {
    expect(validHome("aquarium", [])).toBe(true);
    expect(validHome("coral-reef", [])).toBe(false);
    expect(validHome("coral-reef", ["ocean-friends"])).toBe(true);
    expect(unlockedRewards(["ocean-friends"]).has("happy-spin")).toBe(true);
  });
  it("starter pet is deterministic", () => expect(pickStarterPet("abc")).toEqual(pickStarterPet("abc")));
});
