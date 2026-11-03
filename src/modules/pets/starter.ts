import { PERSONALITIES, SPECIES, COLOR_PRESETS } from "./catalog";

/** Deterministic starter pet per friendship so both friends see the same creature. */
export function pickStarterPet(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pool = SPECIES.filter((s) => s.id !== "custom" && s.id !== "spirit");
  const sp = pool[h % pool.length];
  return {
    species: sp.id,
    rarity: sp.rarity,
    name: "Bubbles",
    personality: PERSONALITIES[(h >>> 4) % PERSONALITIES.length],
    colors: COLOR_PRESETS[(h >>> 8) % COLOR_PRESETS.length],
  };
}
