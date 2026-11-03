import { judge, qualifies, emptyDay, levelForXp, type Candidate, type DayProgress } from "./interactions";
import { settleDay, type StreakState, type SettleOutcome } from "./streak";
import { newlyReached, evolutionStage, type Milestone } from "./milestones";
import { dayKey } from "./time";

export interface Friendship {
  tz: string;
  streak: StreakState;
  xp: number;
  unlocked: string[]; // milestone ids
  evolution: number;
  /** Per-member progress for the *current* local day only. */
  today: { day: string; byUser: Record<string, DayProgress> };
}

export interface ApplyResult {
  friendship: Friendship;
  counted: boolean;
  reason?: string;
  xpGained: number;
  settled: SettleOutcome | null;
  levelUp: number | null;
  evolved: { from: number; to: number } | null;
  milestones: Milestone[];
}

/**
 * Single entry point for friendship progress. Pure and deterministic given the clock,
 * so the route handler only has to load state, call this, and persist the result.
 * `members` must be the two verified members of the friendship (looked up server-side).
 */
export function applyInteraction(f: Friendship, members: [string, string], userId: string, c: Candidate): ApplyResult {
  if (!members.includes(userId)) throw new Error("not_a_member");
  const today = dayKey(new Date(c.at), f.tz);
  const rolled: Friendship["today"] =
    f.today.day === today ? f.today : { day: today, byUser: {} };

  const mine = rolled.byUser[userId] ?? emptyDay();
  const verdict = judge(mine, c);
  if (!verdict.counted) {
    return { friendship: { ...f, today: rolled }, counted: false, reason: verdict.reason, xpGained: 0, settled: null, levelUp: null, evolved: null, milestones: [] };
  }

  const byUser = { ...rolled.byUser, [userId]: verdict.day };
  let streak = f.streak;
  let settled: SettleOutcome | null = null;
  if (members.every((m) => qualifies(byUser[m] ?? emptyDay()))) {
    const r = settleDay(f.streak, today);
    streak = r.state;
    settled = r.outcome === "unchanged" ? null : r.outcome;
  }

  const xp = f.xp + verdict.xp;
  const milestones = newlyReached(streak.longest, f.unlocked);
  const evolution = Math.max(f.evolution, evolutionStage(streak.longest));
  const lvlBefore = levelForXp(f.xp);
  const lvlAfter = levelForXp(xp);

  return {
    friendship: { ...f, streak, xp, unlocked: [...f.unlocked, ...milestones.map((m) => m.id)], evolution, today: { day: today, byUser } },
    counted: true,
    xpGained: verdict.xp,
    settled,
    levelUp: lvlAfter > lvlBefore ? lvlAfter : null,
    evolved: evolution > f.evolution ? { from: f.evolution, to: evolution } : null,
    milestones,
  };
}

export const newFriendship = (tz: string, streak: StreakState): Friendship => ({
  tz, streak, xp: 0, unlocked: [], evolution: 0, today: { day: "", byUser: {} },
});
