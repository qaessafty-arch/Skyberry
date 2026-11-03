import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { friendshipFor, record, todayFor } from "@/modules/progression/service";

const Body = z.object({ friendshipId: z.string().uuid(), mediaPath: z.string().max(300) });

/** Double reveal: submit today's photo. The partner's photo stays hidden (RLS) until both exist. */
export const POST = (req: Request) => authed(async ({ user }) => {
  const p = Body.safeParse(await req.json());
  if (!p.success || !p.data.mediaPath.startsWith(`${user.id}/`)) throw new Error("bad_request");
  const row = await friendshipFor(user.id, p.data.friendshipId);
  const day = todayFor(row);
  const db = adminClient();
  const { error } = await db.from("double_reveals").upsert({ friendship_id: row.id, day, user_id: user.id, media_path: p.data.mediaPath });
  if (error) throw error;
  const { count } = await db.from("double_reveals").select("*", { count: "exact", head: true }).eq("friendship_id", row.id).eq("day", day);
  const progress = await record(user.id, row.id, "photo");
  return { revealed: (count ?? 0) >= 2, day, xpGained: progress.xpGained };
});
