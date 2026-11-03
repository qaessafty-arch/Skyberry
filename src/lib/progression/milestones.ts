export interface Milestone {
  day: number;
  id: string;
  title: string;
  rewards: { kind: "accessory" | "animation" | "environment" | "sticker" | "badge" | "theme"; id: string }[];
}

export const MILESTONES: readonly Milestone[] = [
  { day: 3, id: "first-connection", title: "First Connection", rewards: [{ kind: "badge", id: "first-connection" }, { kind: "accessory", id: "party-hat" }] },
  { day: 7, id: "ocean-friends", title: "Ocean Friends", rewards: [{ kind: "badge", id: "ocean-friends" }, { kind: "animation", id: "happy-spin" }, { kind: "environment", id: "coral-reef" }] },
  { day: 14, id: "growing-together", title: "Growing Together", rewards: [{ kind: "sticker", id: "bubble-pack" }, { kind: "accessory", id: "sunglasses" }] },
  { day: 30, id: "deep-connection", title: "Deep Connection", rewards: [{ kind: "badge", id: "deep-connection" }, { kind: "environment", id: "glass-dome" }, { kind: "animation", id: "dance" }] },
  { day: 50, id: "ocean-soulmates", title: "Ocean Soulmates", rewards: [{ kind: "theme", id: "neon-ocean" }, { kind: "accessory", id: "wings" }] },
  { day: 100, id: "legendary-friendship", title: "Legendary Friendship", rewards: [{ kind: "badge", id: "legendary" }, { kind: "environment", id: "ocean-palace" }] },
  { day: 365, id: "eternal-ocean", title: "Eternal Ocean", rewards: [{ kind: "badge", id: "eternal" }, { kind: "accessory", id: "aura" }, { kind: "theme", id: "eternal-ocean" }] },
];

/** Milestones reached by `longest` that are not yet in `alreadyUnlocked`. Based on longest, so restores never lose them. */
export function newlyReached(longest: number, alreadyUnlocked: readonly string[]): Milestone[] {
  return MILESTONES.filter((m) => longest >= m.day && !alreadyUnlocked.includes(m.id));
}

/** Evolution never regresses: it's driven by the longest streak ever reached. */
export const EVOLUTION_STAGES = [
  { stage: 0, name: "Baby", minLongest: 0 },
  { stage: 1, name: "Growing", minLongest: 7 },
  { stage: 2, name: "Neon", minLongest: 30 },
  { stage: 3, name: "Royal", minLongest: 100 },
  { stage: 4, name: "Legendary Spirit", minLongest: 365 },
] as const;

export function evolutionStage(longest: number): number {
  let s = 0;
  for (const e of EVOLUTION_STAGES) if (longest >= e.minLongest) s = e.stage;
  return s;
}
