import { MILESTONES } from "@/lib/progression/milestones";

export const SPECIES = [
  { id: "axolotl", name: "Axolotl", rarity: "common" },
  { id: "shark", name: "Baby Shark", rarity: "common" },
  { id: "jellyfish", name: "Jellyfish", rarity: "uncommon" },
  { id: "dolphin", name: "Dolphin", rarity: "uncommon" },
  { id: "turtle", name: "Sea Turtle", rarity: "common" },
  { id: "whale", name: "Whale", rarity: "rare" },
  { id: "octopus", name: "Octopus", rarity: "rare" },
  { id: "penguin", name: "Penguin", rarity: "common" },
  { id: "spirit", name: "Ocean Spirit", rarity: "epic" },
  { id: "custom", name: "Custom Creature", rarity: "legendary" },
] as const;
export type SpeciesId = (typeof SPECIES)[number]["id"];

export const PERSONALITIES = ["chaotic", "sleepy", "funny", "shy", "energetic", "curious", "dramatic", "friendly"] as const;
export type Personality = (typeof PERSONALITIES)[number];

/** unlock = reward id granted by a streak milestone; null = free from the start. */
export const ACCESSORIES = [
  { id: "bow", name: "Bow", unlock: null },
  { id: "party-hat", name: "Party Hat", unlock: "party-hat" },
  { id: "sunglasses", name: "Sunglasses", unlock: "sunglasses" },
  { id: "wings", name: "Little Wings", unlock: "wings" },
  { id: "aura", name: "Eternal Aura", unlock: "aura" },
  { id: "crown", name: "Crown", unlock: "__stage3" },
] as const;

export const HOMES = [
  { id: "aquarium", name: "Ocean Aquarium", unlock: null },
  { id: "coral-reef", name: "Coral Reef", unlock: "coral-reef" },
  { id: "glass-dome", name: "Glass Underwater Dome", unlock: "glass-dome" },
  { id: "ocean-palace", name: "Fantasy Ocean Palace", unlock: "ocean-palace" },
] as const;

export const CARE = { perActionPerDay: 3 } as const;

/** Flatten milestone ids into the set of reward ids they unlocked. */
export function unlockedRewards(milestoneIds: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const m of MILESTONES) if (milestoneIds.includes(m.id)) m.rewards.forEach((r) => out.add(r.id));
  return out;
}

export function validEquip(items: string[], unlockedMilestones: string[], evolution = 0): boolean {
  const have = unlockedRewards(unlockedMilestones);
  return items.every((id) => {
    const a = ACCESSORIES.find((x) => x.id === id);
    if (!a) return false;
    if (a.unlock === null) return true;
    if (a.unlock === "__stage3") return evolution >= 3;
    return have.has(a.unlock);
  });
}

export function validHome(id: string, unlockedMilestones: string[]): boolean {
  const h = HOMES.find((x) => x.id === id);
  if (!h) return false;
  return h.unlock === null || unlockedRewards(unlockedMilestones).has(h.unlock);
}

export const COLOR_PRESETS = [
  { body: "#4fc3f7", accent: "#ffffff" }, { body: "#ff8fb1", accent: "#fff3f8" }, { body: "#7cf2d4", accent: "#0b2a4a" },
  { body: "#ffd166", accent: "#ff7a59" }, { body: "#b69cff", accent: "#e6f6ff" }, { body: "#22d3ee", accent: "#0b2a4a" },
];
