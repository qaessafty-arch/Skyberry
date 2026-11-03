import { addDays, daysBetween } from "./time";

/** Gentle by design: missed days are forgiven, and broken streaks can be restored for free. */
export const STREAK_RULES = {
  /** Missed days that are forgiven automatically (the streak "rests" instead of breaking). */
  graceDays: 2,
  /** Days after a break during which the old streak can be restored. */
  restoreWindowDays: 7,
  /** A friendship can restore at most once per this many days. */
  restoreCooldownDays: 30,
} as const;

export interface StreakState {
  current: number;
  longest: number;
  /** Last local day on which BOTH friends qualified. */
  lastCountedDay: string | null;
  /** Days forgiven by grace in the current run (informational). */
  graceUsed: number;
  /** Set when a streak broke: the value it had and the day the break was detected. */
  brokenFrom: number | null;
  brokenOn: string | null;
  lastRestoredOn: string | null;
}

export const emptyStreak = (): StreakState => ({
  current: 0,
  longest: 0,
  lastCountedDay: null,
  graceUsed: 0,
  brokenFrom: null,
  brokenOn: null,
  lastRestoredOn: null,
});

export type SettleOutcome = "started" | "extended" | "forgiven" | "broken" | "unchanged";

/**
 * Called when both friends have qualified on `today` (friendship-local day).
 * Idempotent per day. Pure: returns a new state and what happened.
 */
export function settleDay(prev: StreakState, today: string): { state: StreakState; outcome: SettleOutcome } {
  if (prev.lastCountedDay === today) return { state: prev, outcome: "unchanged" };
  if (prev.lastCountedDay && daysBetween(prev.lastCountedDay, today) < 0) return { state: prev, outcome: "unchanged" };

  const next: StreakState = { ...prev, lastCountedDay: today };
  if (!prev.lastCountedDay) {
    next.current = 1;
    next.longest = Math.max(prev.longest, 1);
    return { state: next, outcome: "started" };
  }
  const gap = daysBetween(prev.lastCountedDay, today); // 1 = consecutive
  const missed = gap - 1;
  if (missed === 0) {
    next.current = prev.current + 1;
    next.longest = Math.max(prev.longest, next.current);
    return { state: next, outcome: "extended" };
  }
  if (missed <= STREAK_RULES.graceDays) {
    next.current = prev.current + 1;
    next.longest = Math.max(prev.longest, next.current);
    next.graceUsed = prev.graceUsed + missed;
    return { state: next, outcome: "forgiven" };
  }
  next.brokenFrom = prev.current;
  next.brokenOn = today;
  next.current = 1;
  next.graceUsed = 0;
  return { state: next, outcome: "broken" };
}

export function canRestore(s: StreakState, today: string): boolean {
  if (s.brokenFrom === null || s.brokenOn === null) return false;
  if (daysBetween(s.brokenOn, today) > STREAK_RULES.restoreWindowDays) return false;
  if (s.lastRestoredOn && daysBetween(s.lastRestoredOn, today) < STREAK_RULES.restoreCooldownDays) return false;
  return true;
}

/** Restores the pre-break streak (plus the day that restarted it). Free; never costs anything. */
export function restoreStreak(s: StreakState, today: string): StreakState | null {
  if (!canRestore(s, today)) return null;
  const current = (s.brokenFrom ?? 0) + 1;
  return {
    ...s,
    current,
    longest: Math.max(s.longest, current),
    brokenFrom: null,
    brokenOn: null,
    lastRestoredOn: today,
  };
}

/**
 * What the UI should show right now, without mutating anything. A streak that has quietly
 * lapsed past grace is shown as "resting" (restorable), never as a punishment.
 */
export function displayStreak(s: StreakState, today: string): { value: number; status: "active" | "resting" | "none" } {
  if (!s.lastCountedDay) return { value: 0, status: "none" };
  const missed = daysBetween(s.lastCountedDay, today) - 1;
  if (missed <= STREAK_RULES.graceDays) return { value: s.current, status: "active" };
  return { value: s.current, status: "resting" };
}

export { addDays };
