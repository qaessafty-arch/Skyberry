import type { NotifyKind } from "@/lib/notify/rules";

export interface PushPayload { title: string; body: string; url: string; tag: string }
/**
 * Push text is deliberately content-free: it names the sender and the kind of event, never the message itself,
 * so nothing sensitive is exposed on a lock screen or to the push provider.
 */
export function buildPushPayload(kind: NotifyKind, p: Record<string, unknown>): PushPayload {
  const from = typeof p.from === "string" && p.from ? p.from : "A friend";
  const cid = typeof p.conversationId === "string" ? p.conversationId : null;
  const chat = cid ? `/chats?c=${cid}` : "/chats";
  switch (kind) {
    case "message": return { title: from, body: "Sent you a message", url: chat, tag: `msg-${cid ?? "x"}` };
    case "mention": return { title: from, body: "Mentioned you", url: chat, tag: `msg-${cid ?? "x"}` };
    case "call": return { title: `${from} is calling`, body: p.mode === "audio" ? "Voice call" : "Video call", url: cid ? `/rooms/${cid}/call?mode=${p.mode === "audio" ? "audio" : "video"}` : "/rooms", tag: `call-${cid ?? "x"}` };
    case "missed_call": return { title: "Missed call", body: "Someone tried to reach you", url: chat, tag: `call-${cid ?? "x"}` };
    case "friend_request": return { title: "Friend request", body: p.accepted ? "Your invite was accepted 🎉" : "Someone wants to be friends", url: "/friends", tag: "friends" };
    case "group_invite": case "room_invite": return { title: "Group invitation", body: "You were added to a room", url: cid ? `/chats?c=${cid}` : "/rooms", tag: "rooms" };
    case "reaction": return { title: "New reaction", body: "Someone reacted to your moment", url: "/moments", tag: "reaction" };
    case "moment": return { title: "New moment", body: "A friend shared a moment", url: "/moments", tag: "moment" };
    case "sticker_request": return { title: "Sticker request", body: "A friend wants to make a sticker of you", url: "/stickers", tag: "stickers" };
  }
}

/** Only these status codes mean "this subscription is gone for good" and should be deleted. */
export const isGoneStatus = (code: number | undefined) => code === 404 || code === 410;

/** Basic shape check for a browser PushSubscription before we store it. */
export function validSubscription(s: unknown): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!s || typeof s !== "object") return false; const o = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof o.endpoint !== "string" || o.endpoint.length > 600) return false;
  try { if (new URL(o.endpoint).protocol !== "https:") return false; } catch { return false; }
  const b64 = /^[A-Za-z0-9_-]+={0,2}$/;
  return typeof o.keys?.p256dh === "string" && b64.test(o.keys.p256dh) && o.keys.p256dh.length < 200 && typeof o.keys?.auth === "string" && b64.test(o.keys.auth) && o.keys.auth.length < 80;
}
