import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { record } from "@/modules/progression/service";
import { isBlocked, limit, notify } from "@/modules/notify/service";
import type { InteractionKind } from "@/lib/progression/interactions";

const Body = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["text", "image", "voice", "sticker", "secret", "surprise", "poll", "game"]),
  body: z.string().max(4000).optional(),
  mediaPath: z.string().max(300).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  replyTo: z.string().uuid().optional(),
  forwardedFrom: z.string().uuid().optional(),
});

const progressKind = (k: string): InteractionKind | null =>
  k === "text" || k === "secret" ? "message" : k === "image" ? "photo" : k === "voice" ? "voice" : k === "game" ? "challenge" : null;

export const POST = (req: Request) => authed(async ({ user }) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new Error("bad_request");
  const b = parsed.data;
  limit("send", user.id, 40);
  const db = adminClient();

  // Membership is verified on the server, not assumed from the client.
  const { data: member } = await db.from("conversation_members").select("user_id").eq("conversation_id", b.conversationId).eq("user_id", user.id).maybeSingle();
  if (!member) throw new Error("forbidden");
  // Media must live in the sender's own folder.
  const { data: roster } = await db.from("conversation_members").select("user_id,muted_until").eq("conversation_id", b.conversationId);
  const { data: cv } = await db.from("conversations").select("kind").eq("id", b.conversationId).single();
  // A block in either direction ends DM delivery.
  if (cv?.kind === "dm") { const other = roster?.find((r) => r.user_id !== user.id); if (other && (await isBlocked(user.id, other.user_id))) throw new Error("forbidden"); }
  // Replies must stay inside this conversation; forwards require the sender to be able to read the source (RLS-checked).
  if (b.replyTo) { const { data: r } = await db.from("messages").select("id").eq("id", b.replyTo).eq("conversation_id", b.conversationId).maybeSingle(); if (!r) throw new Error("bad_request"); }
  if (b.forwardedFrom) { const { data: src } = await (await import("@/lib/supabase/server")).userClient().then((c) => c.from("messages").select("id").eq("id", b.forwardedFrom!).maybeSingle()); if (!src) throw new Error("forbidden"); }
  if (b.mediaPath && !b.mediaPath.startsWith(`${user.id}/`)) throw new Error("bad_request");

  const { data: msg, error } = await db.from("messages").insert({
    conversation_id: b.conversationId, sender_id: user.id, kind: b.kind, body: b.body ?? null, media_path: b.mediaPath ?? null, meta: b.meta ?? {}, reply_to: b.replyTo ?? null, forwarded_from: b.forwardedFrom ?? null,
  }).select().single();
  if (error) throw error;

  // Notify everyone else (mentions get their own kind).
  const handles = [...(b.body ?? "").matchAll(/@([a-z0-9_]{3,20})/g)].map((m) => m[1]);
  const { data: mentioned } = handles.length ? await db.from("profiles").select("id").in("handle", handles) : { data: [] };
  const me = (await db.from("profiles").select("display_name").eq("id", user.id).single()).data;
  await Promise.all((roster ?? []).filter((r) => r.user_id !== user.id).map((r) =>
    notify(r.user_id, mentioned?.some((m) => m.id === r.user_id) ? "mention" : "message", { conversationId: b.conversationId, messageId: msg.id, from: me?.display_name }, { mutedUntil: r.muted_until }).catch(() => null)));

  let progress = null;
  const pk = progressKind(b.kind);
  const { data: convo } = await db.from("conversations").select("friendship_id").eq("id", b.conversationId).single();
  if (pk && convo?.friendship_id) progress = await record(user.id, convo.friendship_id, pk, b.body ?? "");
  return { message: msg, progress: progress && { counted: progress.counted, xpGained: progress.xpGained, settled: progress.settled, evolved: progress.evolved, milestones: progress.milestones, levelUp: progress.levelUp } };
});
