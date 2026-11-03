import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { record } from "@/modules/progression/service";
import { isBlocked, limit, notify } from "@/modules/notify/service";
import { validateUpload } from "@/lib/security/upload";
import { safeDisplayName } from "@/lib/media/helpers";

const MEDIA_KINDS = ["image", "video", "audio", "voice", "file"] as const;
const ALLOWED_UPLOAD_KIND: Record<string, string> = { image: "image", video: "video", audio: "audio", voice: "audio", file: "file" };
import type { InteractionKind } from "@/lib/progression/interactions";

const Body = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["text", "image", "voice", "sticker", "secret", "surprise", "poll", "game", "video", "audio", "file"]),
  body: z.string().max(4000).optional(),
  mediaPath: z.string().max(300).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  replyTo: z.string().uuid().optional(),
  forwardedFrom: z.string().uuid().optional(),
});

const progressKind = (k: string): InteractionKind | null =>
  k === "text" || k === "secret" ? "message" : k === "image" || k === "video" ? "photo" : k === "voice" ? "voice" : k === "game" ? "challenge" : null;

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
  const { data: cv } = await db.from("conversations").select("kind,only_admins_post").eq("id", b.conversationId).single();
  const myRole = (await db.from("conversation_members").select("role").eq("conversation_id", b.conversationId).eq("user_id", user.id).single()).data?.role;
  if (cv?.kind === "group" && cv.only_admins_post && myRole === "member") throw new Error("forbidden");
  // A block in either direction ends DM delivery.
  if (cv?.kind === "dm") { const other = roster?.find((r) => r.user_id !== user.id); if (other && (await isBlocked(user.id, other.user_id))) throw new Error("forbidden"); }
  // Replies must stay inside this conversation; forwards require the sender to be able to read the source (RLS-checked).
  if (b.replyTo) { const { data: r } = await db.from("messages").select("id").eq("id", b.replyTo).eq("conversation_id", b.conversationId).maybeSingle(); if (!r) throw new Error("bad_request"); }
  if (b.forwardedFrom) { const { data: src } = await (await import("@/lib/supabase/server")).userClient().then((c) => c.from("messages").select("id").eq("id", b.forwardedFrom!).maybeSingle()); if (!src) throw new Error("forbidden"); }
  if (b.mediaPath && !b.mediaPath.startsWith(`${user.id}/`)) throw new Error("bad_request");
  // Media messages: the object must really exist in the sender's folder, and its STORED type/size must pass the upload policy
  // for the claimed kind. Display metadata (name/size/mime) comes from storage, not from the client.
  let meta: Record<string, unknown> = b.meta ?? {};
  if ((MEDIA_KINDS as readonly string[]).includes(b.kind)) {
    if (!b.mediaPath || b.mediaPath.includes("..")) throw new Error("bad_request");
    const [folder, file] = [b.mediaPath.split("/")[0], b.mediaPath.split("/").slice(1).join("/")];
    const { data: found } = await db.storage.from("media").list(folder, { search: file, limit: 5 });
    const obj = found?.find((o) => o.name === file);
    if (!obj) throw new Error("bad_request");
    const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
    const mime = String((obj.metadata as { mimetype?: string } | null)?.mimetype ?? "");
    const v = validateUpload(file, mime, size);
    if (!v.ok || v.kind !== ALLOWED_UPLOAD_KIND[b.kind]) throw new Error("bad_request");
    meta = { ...meta, name: safeDisplayName(String(meta.name ?? file)), size, mime };
  }

  const { data: msg, error } = await db.from("messages").insert({
    conversation_id: b.conversationId, sender_id: user.id, kind: b.kind, body: b.body ?? null, media_path: b.mediaPath ?? null, meta, reply_to: b.replyTo ?? null, forwarded_from: b.forwardedFrom ?? null,
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
