import { describe, it, expect } from "vitest";
import { dayKey, daysBetween } from "./time";
import { emptyStreak, settleDay, restoreStreak, displayStreak, STREAK_RULES } from "./streak";
import { newlyReached, evolutionStage } from "./milestones";
import { emptyDay, judge, qualifies, levelForXp } from "./interactions";
import { applyInteraction, newFriendship } from "./engine";

const T0 = Date.parse("2026-03-01T12:00:00Z");
const DAY = 86_400_000;

describe("time zones", () => {
  it("assigns the same instant to different local days", () => {
    const at = new Date("2026-03-01T23:30:00Z");
    expect(dayKey(at, "UTC")).toBe("2026-03-01");
    expect(dayKey(at, "Asia/Tokyo")).toBe("2026-03-02");
    expect(dayKey(at, "America/Los_Angeles")).toBe("2026-03-01");
  });
  it("falls back to UTC on a bogus zone", () => expect(dayKey(new Date(T0), "Mars/Base")).toBe("2026-03-01"));
  it("counts days across DST changes as 1", () => expect(daysBetween("2026-03-07", "2026-03-08")).toBe(1));
});

describe("streak", () => {
  it("starts, extends, and is idempotent within a day", () => {
    let s = settleDay(emptyStreak(), "2026-03-01").state;
    expect(s.current).toBe(1);
    expect(settleDay(s, "2026-03-01").outcome).toBe("unchanged");
    s = settleDay(s, "2026-03-02").state;
    expect(s.current).toBe(2);
  });
  it("forgives missed days within grace", () => {
    let s = settleDay(emptyStreak(), "2026-03-01").state;
    const r = settleDay(s, "2026-03-03"); // missed 1
    expect(r.outcome).toBe("forgiven");
    expect(r.state.current).toBe(2);
  });
  it("breaks past grace but keeps longest, then can restore once", () => {
    let s = emptyStreak();
    for (let i = 1; i <= 10; i++) s = settleDay(s, `2026-03-${String(i).padStart(2, "0")}`).state;
    const gapDay = `2026-03-${String(10 + STREAK_RULES.graceDays + 2).padStart(2, "0")}`;
    const r = settleDay(s, gapDay);
    expect(r.outcome).toBe("broken");
    expect(r.state.current).toBe(1);
    expect(r.state.longest).toBe(10);
    const restored = restoreStreak(r.state, gapDay)!;
    expect(restored.current).toBe(11);
    expect(restoreStreak(restored, gapDay)).toBeNull();
  });
  it("does not allow restore after the window", () => {
    let s = settleDay(emptyStreak(), "2026-03-01").state;
    s = settleDay(s, "2026-03-20").state;
    expect(restoreStreak(s, "2026-04-15")).toBeNull();
  });
  it("shows a lapsed streak as resting, not zero", () => {
    const s = settleDay(emptyStreak(), "2026-03-01").state;
    expect(displayStreak(s, "2026-03-20").status).toBe("resting");
    expect(displayStreak(s, "2026-03-02").status).toBe("active");
  });
});

describe("milestones & evolution", () => {
  it("unlocks by longest and never twice", () => {
    expect(newlyReached(7, []).map((m) => m.day)).toEqual([3, 7]);
    expect(newlyReached(7, ["first-connection"]).map((m) => m.day)).toEqual([7]);
  });
  it("evolves on the documented thresholds", () => {
    expect([0, 6, 7, 30, 100, 365].map(evolutionStage)).toEqual([0, 0, 1, 2, 3, 4]);
  });
});

describe("anti-spam", () => {
  it("rejects too-short, duplicate, and rapid-fire messages", () => {
    let d = emptyDay();
    expect(judge(d, { kind: "message", at: T0, text: "hi" }).counted).toBe(false);
    const a = judge(d, { kind: "message", at: T0, text: "hello there" });
    expect(a.counted).toBe(true);
    d = a.day;
    expect(judge(d, { kind: "message", at: T0 + 5_000, text: "another one" })).toMatchObject({ counted: false, reason: "too_fast" });
    expect(judge(d, { kind: "message", at: T0 + 60_000, text: "  HELLO   there " })).toMatchObject({ counted: false, reason: "duplicate" });
  });
  it("caps daily XP per kind", () => {
    let d = emptyDay();
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const v = judge(d, { kind: "photo", at: T0 + i });
      if (v.counted) { d = v.day; total += v.xp; }
    }
    expect(total).toBe(15);
  });
  it("needs 3 messages or one rich action to qualify", () => {
    let d = emptyDay();
    for (let i = 0; i < 2; i++) { const v = judge(d, { kind: "message", at: T0 + i * 60_000, text: `message number ${i}` }); if (v.counted) d = v.day; }
    expect(qualifies(d)).toBe(false);
    expect(qualifies(judge(emptyDay(), { kind: "moment", at: T0 }).day)).toBe(true);
  });
  it("levels are monotonic", () => expect([0, 25, 100, 400].map(levelForXp)).toEqual([1, 2, 3, 5]));
});

describe("engine", () => {
  const members: [string, string] = ["a", "b"];
  it("only settles the day when BOTH friends qualify", () => {
    let f = newFriendship("UTC", emptyStreak());
    let r = applyInteraction(f, members, "a", { kind: "moment", at: T0 });
    expect(r.settled).toBeNull();
    expect(r.friendship.streak.current).toBe(0);
    r = applyInteraction(r.friendship, members, "b", { kind: "photo", at: T0 + 1000 });
    expect(r.settled).toBe("started");
    expect(r.friendship.streak.current).toBe(1);
  });
  it("one person spamming cannot advance the streak", () => {
    let f = newFriendship("UTC", emptyStreak());
    for (let i = 0; i < 30; i++) f = applyInteraction(f, members, "a", { kind: "message", at: T0 + i * 60_000, text: `spam ${i} xx` }).friendship;
    expect(f.streak.current).toBe(0);
  });
  it("rejects non-members", () => {
    expect(() => applyInteraction(newFriendship("UTC", emptyStreak()), members, "mallory", { kind: "moment", at: T0 })).toThrow();
  });
  it("rolls over the day by the friendship time zone", () => {
    let f = newFriendship("Asia/Tokyo", emptyStreak());
    const step = (u: string, at: number) => (f = applyInteraction(f, members, u, { kind: "moment", at }).friendship);
    step("a", T0); step("b", T0);
    step("a", T0 + DAY); const r = applyInteraction(f, members, "b", { kind: "moment", at: T0 + DAY });
    expect(r.friendship.streak.current).toBe(2);
  });
  it("reports evolution and milestones at day 7", () => {
    let f = newFriendship("UTC", emptyStreak());
    let last!: ReturnType<typeof applyInteraction>;
    for (let d = 0; d < 7; d++) for (const u of members) { last = applyInteraction(f, members, u, { kind: "moment", at: T0 + d * DAY }); f = last.friendship; }
    expect(f.streak.current).toBe(7);
    expect(f.evolution).toBe(1);
    expect(f.unlocked).toContain("ocean-friends");
  });
});
