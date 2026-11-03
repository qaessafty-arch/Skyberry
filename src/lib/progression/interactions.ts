/**
 * Anti-spam gate for friendship progress. The server validates every interaction against
 * rows it fetched itself; nothing here trusts a client-supplied count.
 */
export type InteractionKind = "message" | "photo" | "voice" | "moment" | "challenge" | "pet_care";

export const RULES = {
  /** Minimum gap between two *counted* messages from one person. */
  minMessageGapMs: 45_000,
  minMessageChars: 3,
  /** Counted messages needed in one day for text alone to qualify the day. */
  messagesToQualify: 3,
  /** Daily XP caps per kind (XP never gates core features). */
  xpCap: { message: 10, photo: 15, voice: 10, moment: 20, challenge: 30, pet_care: 15 } as Record<InteractionKind, number>,
  xpPer: { message: 1, photo: 5, voice: 4, moment: 8, challenge: 15, pet_care: 3 } as Record<InteractionKind, number>,
  /** Kinds that qualify a day on their own (one is enough). */
  solo: ["photo", "voice", "moment", "challenge"] as InteractionKind[],
} as const;

export interface DayProgress {
  /** Counted interactions today, per kind. */
  counts: Partial<Record<InteractionKind, number>>;
  xp: Partial<Record<InteractionKind, number>>;
  lastMessageAt: number | null;
  lastMessageHash: string | null;
}

export const emptyDay = (): DayProgress => ({ counts: {}, xp: {}, lastMessageAt: null, lastMessageHash: null });

export interface Candidate {
  kind: InteractionKind;
  at: number; // epoch ms, server clock
  /** For messages: normalized body, used to reject copy-paste farming. */
  text?: string;
}

export type Verdict = { counted: true; xp: number; day: DayProgress } | { counted: false; reason: string; day: DayProgress };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function judge(day: DayProgress, c: Candidate): Verdict {
  if (c.kind === "message") {
    const text = norm(c.text ?? "");
    if (text.length < RULES.minMessageChars) return { counted: false, reason: "too_short", day };
    if (day.lastMessageHash === text) return { counted: false, reason: "duplicate", day };
    if (day.lastMessageAt !== null && c.at - day.lastMessageAt < RULES.minMessageGapMs)
      return { counted: false, reason: "too_fast", day };
  }
  const earned = day.xp[c.kind] ?? 0;
  const xp = Math.max(0, Math.min(RULES.xpPer[c.kind], RULES.xpCap[c.kind] - earned));
  const next: DayProgress = {
    counts: { ...day.counts, [c.kind]: (day.counts[c.kind] ?? 0) + 1 },
    xp: { ...day.xp, [c.kind]: earned + xp },
    lastMessageAt: c.kind === "message" ? c.at : day.lastMessageAt,
    lastMessageHash: c.kind === "message" ? norm(c.text ?? "") : day.lastMessageHash,
  };
  return { counted: true, xp, day: next };
}

/** Has this person done enough today to count toward the streak? */
export function qualifies(day: DayProgress): boolean {
  if (RULES.solo.some((k) => (day.counts[k] ?? 0) > 0)) return true;
  return (day.counts.message ?? 0) >= RULES.messagesToQualify;
}

export const dayXp = (d: DayProgress) => Object.values(d.xp).reduce((a, b) => a + (b ?? 0), 0);

/** Friendship level from lifetime XP. Smooth, uncapped, cosmetic. */
export const levelForXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
export const xpForLevel = (level: number) => (level - 1) ** 2 * 25;
