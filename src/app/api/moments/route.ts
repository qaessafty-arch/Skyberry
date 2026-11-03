import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { record } from "@/modules/progression/service";
import { limit, notify } from "@/modules/notify/service";

const Body = z.object({
  kind: z.enum(["photo", "video", "text", "voice", "mood", "music", "memory"]),
  body: z.string().max(2000).optional(),
  mediaPath: z.string().max(300).optional(),
  mood: z.string().max(40).optional(),
  promptId: z.string().max(40).optional(),
  audience: z.enum(["private", "friends", "close", "selected"]).default("friends"),
  /** Stories vanish after 24h unless saved as a permanent memory. */
  permanent: z.boolean().default(false),
  selected: z.array(z.string().uuid()).max(100).default([]),
});

export const POST = (req: Request) => authed(async ({ user }) => {
  const p = Body.safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const b = p.data;
  if (b.mediaPath && !b.mediaPath.startsWith(`${user.id}/`)) throw new Error("bad_request");
  limit("moment", user.id, 20);
  const db = adminClient();

  const { data: m, error } = await db.from("moments").insert({
    author_id: user.id, kind: b.kind, body: b.body ?? null, media_path: b.mediaPath ?? null, mood: b.mood ?? null, prompt_id: b.promptId ?? null, audience: b.audience, expires_at: b.permanent || b.audience === "private" ? null : new Date(Date.now() + 86_400_000).toISOString(),
  }).select().single();
  if (error) throw error;

  if (b.audience === "selected" && b.selected.length) {
    // Only people the author is actually friends with may be added to an audience.
    const { data: fr } = await db.from("friendships").select("user_a,user_b").eq("status", "accepted").or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    const friends = new Set((fr ?? []).map((f) => (f.user_a === user.id ? f.user_b : f.user_a)));
    const rows = b.selected.filter((id) => friends.has(id)).map((id) => ({ moment_id: m.id, user_id: id }));
    if (rows.length) await db.from("moment_audience").insert(rows);
  }

  // Tell the people who can see it (never for private posts).
  if (b.audience !== "private") {
    const { data: fr } = await db.from("friendships").select("user_a,user_b").eq("status", "accepted").or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    let audience = (fr ?? []).map((f) => (f.user_a === user.id ? f.user_b : f.user_a));
    if (b.audience === "close") audience = ((await db.from("close_friends").select("friend_id").eq("owner_id", user.id)).data ?? []).map((r) => r.friend_id);
    if (b.audience === "selected") audience = ((await db.from("moment_audience").select("user_id").eq("moment_id", m.id)).data ?? []).map((r) => r.user_id);
    await Promise.all(audience.map((id) => notify(id, "moment", { momentId: m.id, by: user.id }).catch(() => null)));
  }

  // A shared moment counts toward every accepted friendship of the author (private ones don't).
  const results = [];
  if (b.audience !== "private") {
    const { data: fr } = await db.from("friendships").select("id").eq("status", "accepted").or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    for (const f of fr ?? []) results.push(await record(user.id, f.id, "moment").catch(() => null));
  }
  return { moment: m, celebrated: results.filter(Boolean).length };
});
