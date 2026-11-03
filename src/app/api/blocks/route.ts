import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";

const B = z.object({ userId: z.string().uuid(), blocked: z.boolean() });
export const POST = (req: Request) => authed(async ({ user }) => {
  const p = B.safeParse(await req.json()); if (!p.success || p.data.userId === user.id) throw new Error("bad_request");
  const db = adminClient();
  if (p.data.blocked) {
    await db.from("blocks").upsert({ blocker: user.id, blocked: p.data.userId });
    await db.from("close_friends").delete().or(`and(owner_id.eq.${user.id},friend_id.eq.${p.data.userId}),and(owner_id.eq.${p.data.userId},friend_id.eq.${user.id})`);
  } else await db.from("blocks").delete().eq("blocker", user.id).eq("blocked", p.data.userId);
  return { ok: true };
});
