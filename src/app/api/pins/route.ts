import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";

const B = z.object({ messageId: z.string().uuid(), pinned: z.boolean() });
/** Pin FOR EVERYONE in the conversation. (Private bookmarks live in /api/saved.) Groups: admins/owners only. */
export const POST = (req: Request) => authed(async ({ user }) => {
  const p = B.safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: m } = await db.from("messages").select("conversation_id,deleted_at").eq("id", p.data.messageId).maybeSingle();
  if (!m || m.deleted_at) throw new Error("forbidden");
  const { data: mem } = await db.from("conversation_members").select("role").eq("conversation_id", m.conversation_id).eq("user_id", user.id).maybeSingle();
  const { data: c } = await db.from("conversations").select("kind").eq("id", m.conversation_id).single();
  if (!mem || (c?.kind === "group" && mem.role === "member")) throw new Error("forbidden");
  if (p.data.pinned) await db.from("pinned_messages").upsert({ conversation_id: m.conversation_id, message_id: p.data.messageId, pinned_by: user.id });
  else await db.from("pinned_messages").delete().eq("message_id", p.data.messageId);
  return { ok: true };
});
