import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit, notify } from "@/modules/notify/service";
import { MAX_MESH_PARTICIPANTS } from "@/lib/calls/logic";

const STALE_MS = 6 * 3600_000; // a call open longer than this is treated as abandoned

/** join = start-or-join. Members only. Starting rings everyone else (in-app + push); leaving the last person ends the call. */
export const POST = (req: Request) => authed(async ({ user }) => {
  limit("call", user.id, 30);
  const p = z.object({ conversationId: z.string().uuid(), action: z.enum(["join", "leave"]), mode: z.enum(["audio", "video"]).default("video") }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const { conversationId, action, mode } = p.data; const db = adminClient();
  const { data: roster } = await db.from("conversation_members").select("user_id,muted_until").eq("conversation_id", conversationId);
  if (!roster?.some((m) => m.user_id === user.id)) throw new Error("forbidden");
  const { data: convo } = await db.from("conversations").select("expires_at,title,kind").eq("id", conversationId).single();
  if (convo?.expires_at && Date.parse(convo.expires_at) < Date.now()) throw new Error("forbidden");

  const { data: open } = await db.from("call_logs").select("*").eq("conversation_id", conversationId).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const live = open && Date.now() - Date.parse(open.started_at) < STALE_MS ? open : null;
  if (open && !live) await db.from("call_logs").update({ ended_at: new Date().toISOString() }).eq("id", open.id);

  if (action === "leave") {
    if (!live) return { ok: true };
    const { data: after } = await db.rpc("call_leave", { p_call: live.id, p_user: user.id });
    const row = Array.isArray(after) ? after[0] : after;
    // Nobody ever picked up → everyone else gets a missed-call notification.
    if (row?.ended_at && row.joined.length === 1) await Promise.all(roster.filter((m) => m.user_id !== user.id).map((m) => notify(m.user_id, "missed_call", { conversationId, from: user.id }, { mutedUntil: m.muted_until }).catch(() => null)));
    return { ok: true };
  }

  if (live && live.active.length >= MAX_MESH_PARTICIPANTS && !live.active.includes(user.id)) throw new Error("forbidden"); // room full
  let call = live;
  const started = !live;
  if (!call) call = (await db.from("call_logs").insert({ conversation_id: conversationId, started_by: user.id }).select().single()).data!;
  await db.rpc("call_join", { p_call: call.id, p_user: user.id });
  if (started) {
    const me = (await db.from("profiles").select("display_name").eq("id", user.id).single()).data;
    await Promise.all(roster.filter((m) => m.user_id !== user.id).map((m) => notify(m.user_id, "call", { conversationId, from: me?.display_name, mode }, { mutedUntil: m.muted_until }).catch(() => null)));
  }
  return { ok: true, callId: call.id, started };
});
