import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { friendshipFor, todayFor } from "@/modules/progression/service";
import { restoreStreak, type StreakState } from "@/lib/progression/streak";

/** Free, server-validated streak restoration. */
export const POST = (req: Request) => authed(async ({ user }) => {
  const p = z.object({ friendshipId: z.string().uuid() }).safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const row = await friendshipFor(user.id, p.data.friendshipId);
  const db = adminClient();
  const { data } = await db.from("friend_progress").select("streak").eq("friendship_id", row.id).single();
  const restored = restoreStreak(data!.streak as StreakState, todayFor(row));
  if (!restored) return { restored: false };
  await db.from("friend_progress").update({ streak: restored }).eq("friendship_id", row.id);
  return { restored: true, current: restored.current };
});
