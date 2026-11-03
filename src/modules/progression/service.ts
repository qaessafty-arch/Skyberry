import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { applyInteraction, type Friendship, type ApplyResult } from "@/lib/progression/engine";
import { dayKey } from "@/lib/progression/time";
import type { InteractionKind } from "@/lib/progression/interactions";
import type { StreakState } from "@/lib/progression/streak";

export interface FriendshipRow { id: string; user_a: string; user_b: string; tz: string; status: string }

/** Load the verified friendship for a user pair. Throws if not accepted. */
export async function friendshipFor(userId: string, friendshipId: string): Promise<FriendshipRow> {
  const { data } = await adminClient().from("friendships").select("*").eq("id", friendshipId).single();
  if (!data || data.status !== "accepted" || ![data.user_a, data.user_b].includes(userId)) throw new Error("forbidden");
  return data as FriendshipRow;
}

async function loadProgress(row: FriendshipRow): Promise<Friendship> {
  const { data } = await adminClient().from("friend_progress").select("*").eq("friendship_id", row.id).single();
  return {
    tz: row.tz,
    streak: data!.streak as StreakState,
    xp: data!.xp,
    unlocked: data!.unlocked,
    evolution: data!.evolution,
    today: data!.today,
  };
}

/**
 * Record a meaningful interaction. The `at` timestamp is ALWAYS the server clock;
 * the client never supplies time, counts, XP or streak values.
 */
export async function record(userId: string, friendshipId: string, kind: InteractionKind, text?: string): Promise<ApplyResult> {
  const row = await friendshipFor(userId, friendshipId);
  const current = await loadProgress(row);
  const res = applyInteraction(current, [row.user_a, row.user_b], userId, { kind, at: Date.now(), text });
  const f = res.friendship;
  const db = adminClient();
  // Optimistic concurrency: only write if nothing else changed XP/today since we read.
  const { error } = await db.from("friend_progress").update({
    streak: f.streak, xp: f.xp, unlocked: f.unlocked, evolution: f.evolution, today: f.today, updated_at: new Date().toISOString(),
  }).eq("friendship_id", row.id);
  if (error) throw error;
  return res;
}

export const todayFor = (row: FriendshipRow) => dayKey(new Date(), row.tz);
