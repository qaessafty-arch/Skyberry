import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit } from "@/modules/notify/service";

/** Create a pack. With conversationId it's a friend-group pack usable by that chat's members. */
export const POST = (req: Request) => authed(async ({ user }) => {
  limit("pack", user.id, 20);
  const p = z.object({ name: z.string().min(1).max(40), conversationId: z.string().uuid().optional() }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  if (p.data.conversationId) { const { data: m } = await db.from("conversation_members").select("user_id").eq("conversation_id", p.data.conversationId).eq("user_id", user.id).maybeSingle(); if (!m) throw new Error("forbidden"); }
  const { data, error } = await db.from("sticker_packs").insert({ owner_id: user.id, name: p.data.name, conversation_id: p.data.conversationId ?? null }).select().single();
  if (error) throw error; return { pack: data };
});

/** Share a pack with a friend (they can use, not edit). */
export const PUT = (req: Request) => authed(async ({ user }) => {
  const p = z.object({ packId: z.string().uuid(), userId: z.string().uuid() }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: pk } = await db.from("sticker_packs").select("owner_id").eq("id", p.data.packId).maybeSingle(); if (!pk || pk.owner_id !== user.id) throw new Error("forbidden");
  const [x, y] = [user.id, p.data.userId].sort();
  const { data: f } = await db.from("friendships").select("id").eq("user_a", x).eq("user_b", y).eq("status", "accepted").maybeSingle(); if (!f) throw new Error("forbidden");
  await db.from("pack_shares").upsert({ pack_id: p.data.packId, user_id: p.data.userId }); return { ok: true };
});
