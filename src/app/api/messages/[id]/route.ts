import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit } from "@/modules/notify/service";
import { can, type Role } from "@/lib/groups/permissions";

async function load(id: string, userId: string) {
  const db = adminClient();
  const { data: m } = await db.from("messages").select("*").eq("id", id).maybeSingle();
  if (!m) throw new Error("forbidden");
  const { data: mem } = await db.from("conversation_members").select("role").eq("conversation_id", m.conversation_id).eq("user_id", userId).maybeSingle();
  if (!mem) throw new Error("forbidden");
  return { m, role: mem.role as string, db };
}

/** Edit: sender only, text kinds only. */
export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => authed(async ({ user }) => {
  limit("edit", user.id, 30);
  const p = z.object({ body: z.string().min(1).max(4000) }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const { m, db } = await load((await ctx.params).id, user.id);
  if (m.sender_id !== user.id || m.deleted_at || !["text", "secret"].includes(m.kind)) throw new Error("forbidden");
  await db.from("messages").update({ body: p.data.body, edited_at: new Date().toISOString() }).eq("id", m.id);
  return { ok: true };
});

/** Delete (soft, content wiped): sender, or an admin/owner of a group. */
export const DELETE = (_req: Request, ctx: { params: Promise<{ id: string }> }) => authed(async ({ user }) => {
  limit("delete", user.id, 30);
  const { m, role, db } = await load((await ctx.params).id, user.id);
  if (m.sender_id !== user.id && !can(role as Role, "deleteOthersMessages")) throw new Error("forbidden");
  await db.from("messages").update({ body: null, media_path: null, meta: {}, deleted_at: new Date().toISOString() }).eq("id", m.id);
  await db.from("pinned_messages").delete().eq("message_id", m.id);
  return { ok: true };
});
