import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { record } from "@/modules/progression/service";
import { isBlocked, limit, notify } from "@/modules/notify/service";
import { verifyStoredMedia } from "@/modules/media/verify";

const Body = z.object({
  kind: z.enum(["photo", "video", "text", "voice", "mood", "music", "memory"]),
  body: z.string().max(2000).optional(),
  mediaPath: z.string().max(300).optional(),
  mood: z.string().max(40).optional(),
  promptId: z.string().max(40).optional(),
  audience: z.enum(["private", "friends", "close", "selected"]).default("friends"),
  /** Stories vanish after 24h unless saved as a permanent memory. */
  permanent: z.boolean().default(false),
  meta: z.object({ cover: z.string().max(300).optional(), url: z.string().url().max(300).optional(), title: z.string().max(100).optional(), lat: z.number().optional(), lng: z.number().optional(), label: z.string().max(80).optional() }).optional(),
  selected: z.array(z.string().uuid()).max(100).default([]),
  /** Share with every member of a group you belong to (membership is snapshotted at post time). */
  groupId: z.string().uuid().optional(),
});

export const POST = (req: Request) => authed(async ({ user }) => {
  const p = Body.safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const b = p.data;
  if (b.mediaPath && !b.mediaPath.startsWith(`${user.id}/`)) throw new Error("bad_request");
  limit("moment", user.id, 20);
  if (b.meta?.cover && !b.meta.cover.startsWith(`${user.id}/`)) throw new Error("bad_request");
  if (b.meta?.url && !/^https?:\/\//.test(b.meta.url)) throw new Error("bad_request");
  const db = adminClient();
  // Photo/video moments must reference a real, policy-compliant file of the matching type.
  if (b.kind === "photo" || b.kind === "video") {
    if (!b.mediaPath) throw new Error("bad_request");
    const v = await verifyStoredMedia(db, user.id, b.mediaPath);
    if (!v || v.kind !== (b.kind === "photo" ? "image" : "video")) throw new Error("bad_request");
  }
  if (b.meta?.cover && !(await verifyStoredMedia(db, user.id, b.meta.cover))) throw new Error("bad_request");

  const { data: m, error } = await db.from("moments").insert({
    author_id: user.id, kind: b.kind, body: b.body ?? null, media_path: b.mediaPath ?? null, mood: b.mood ?? null, prompt_id: b.promptId ?? null, meta: b.meta ?? {}, audience: b.audience, expires_at: b.permanent || b.audience === "private" ? null : new Date(Date.now() + 86_400_000).toISOString(),
  }).select().single();
  if (error) throw error;

  if (b.groupId) {
    const { data: gm } = await db.from("conversation_members").select("user_id").eq("conversation_id", b.groupId);
    if (!gm?.some((r) => r.user_id === user.id)) throw new Error("forbidden");
    const ids: string[] = []; for (const r of gm) if (r.user_id !== user.id && !(await isBlocked(user.id, r.user_id))) ids.push(r.user_id);
    b.selected = ids; b.audience = "selected";
  }
  if (b.audience === "selected" && b.selected.length) {
    // Only people the author is actually friends with may be added to an audience.
    const { data: fr } = await db.from("friendships").select("user_a,user_b").eq("status", "accepted").or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    const friends = new Set((fr ?? []).map((f) => (f.user_a === user.id ? f.user_b : f.user_a)));
    const rows = b.selected.filter((id) => b.groupId || friends.has(id)).map((id) => ({ moment_id: m.id, user_id: id }));
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
