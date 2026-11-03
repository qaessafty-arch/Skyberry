import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { record } from "@/modules/progression/service";
import { isBlocked, limit, notify } from "@/modules/notify/service";
import { verifyStoredMedia } from "@/modules/media/verify";
import { validateGifUrl } from "@/lib/stickers/logic";
import { userClient } from "@/lib/supabase/server";
import { safeDisplayName } from "@/lib/media/helpers";

const MEDIA_KINDS = ["image", "video", "audio", "voice", "file"] as const;
const ALLOWED_UPLOAD_KIND: Record<string, string> = { image: "image", video: "video", audio: "audio", voice: "audio", file: "file" };
import type { InteractionKind } from "@/lib/progression/interactions";

const Body = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["text", "image", "voice", "sticker", "secret", "surprise", "poll", "game", "video", "audio", "file", "location", "gif"]),
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
  const { data: cv } = await db.from("conversations").select("kind,only_admins_post,expires_at").eq("id", b.conversationId).single();
  if (cv?.expires_at && Date.parse(cv.expires_at) < Date.now()) throw new Error("forbidden"); // temporary room has ended
  const myRole = (await db.from("conversation_members").select("role").eq("conversation_id", b.conversationId).eq("user_id", user.id).single()).data?.role;
  if (cv?.kind === "group" && cv.only_admins_post && myRole === "member") throw new Error("forbidden");
  // A block in either direction ends DM delivery.
  if (cv?.kind === "dm") { const other = roster?.find((r) => r.user_id !== user.id); if (other && (await isBlocked(user.id, other.user_id))) throw new Error("forbidden"); }
  // Location messages: coordinates must be real numbers in range; we round to ~1 m so we never store false precision.
  if (b.kind === "location") {
    const lat = Number(b.meta?.lat), lng = Number(b.meta?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("bad_request");
    b.meta = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, label: typeof b.meta?.label === "string" ? b.meta.label.slice(0, 80) : undefined };
  }
  // Replies must stay inside this conversation; forwards require the sender to be able to read the source (RLS-checked).
  if (b.replyTo) { const { data: r } = await db.from("messages").select("id").eq("id", b.replyTo).eq("conversation_id", b.conversationId).maybeSingle(); if (!r) throw new Error("bad_request"); }
  if (b.forwardedFrom) { const { data: src } = await (await import("@/lib/supabase/server")).userClient().then((c) => c.from("messages").select("id").eq("id", b.forwardedFrom!).maybeSingle()); if (!src) throw new Error("forbidden"); }
  // Sticker messages: media comes from a sticker the sender can SEE (RLS: owned, shared, or friend-group pack with settled consent).
  let stickerMedia: string | null = null;
  if (b.kind === "sticker" && typeof b.meta?.stickerId === "string") {
    const { data: st } = await (await userClient()).from("stickers").select("id,media_path,consent").eq("id", b.meta.stickerId).maybeSingle();
    if (!st || !["self", "approved"].includes(st.consent)) throw new Error("forbidden");
    stickerMedia = st.media_path;
    await db.from("sticker_recents").upsert({ user_id: user.id, sticker_id: st.id, used_at: new Date().toISOString() });
  } else if (b.mediaPath && b.kind !== "sticker" && !b.mediaPath.startsWith(`${user.id}/`)) throw new Error("bad_request");
  if (b.kind === "sticker" && b.mediaPath && !stickerMedia) throw new Error("bad_request");
  if (b.kind === "gif") { const u = validateGifUrl(b.meta?.url); if (!u) throw new Error("bad_request"); b.meta = { url: u, title: typeof b.meta?.title === "string" ? b.meta.title.slice(0, 80) : undefined }; }
  // Media messages: the object must really exist in the sender's folder, and its STORED type/size must pass the upload policy
  // for the claimed kind. Display metadata (name/size/mime) comes from storage, not from the client.
  let meta: Record<string, unknown> = b.meta ?? {};
  if ((MEDIA_KINDS as readonly string[]).includes(b.kind)) {
    if (!b.mediaPath || b.mediaPath.includes("..")) throw new Error("bad_request");
    const v = await verifyStoredMedia(db, user.id, b.mediaPath);
    if (!v || v.kind !== ALLOWED_UPLOAD_KIND[b.kind]) throw new Error("bad_request");
    const { file, size, mime } = v;
    meta = { ...meta, name: safeDisplayName(String(meta.name ?? file)), size, mime };
  }

  const { data: msg, error } = await db.from("messages").insert({
    conversation_id: b.conversationId, sender_id: user.id, kind: b.kind, body: b.body ?? null, media_path: stickerMedia ?? b.mediaPath ?? null, meta, reply_to: b.replyTo ?? null, forwarded_from: b.forwardedFrom ?? null,
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
