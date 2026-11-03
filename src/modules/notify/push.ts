import "server-only";
import webpush from "web-push";
import { adminClient } from "@/lib/supabase/server";
import { buildPushPayload, isGoneStatus } from "@/lib/push/payload";
import type { NotifyKind } from "@/lib/notify/rules";

let configured: boolean | null = null;
export function pushConfigured() {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  configured = !!(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub!, priv!);
  return configured;
}

/** Send a content-free push to all of a user's devices. Dead subscriptions (404/410) are removed. Never throws. */
export async function sendPush(userId: string, kind: NotifyKind, data: Record<string, unknown>) {
  if (!pushConfigured()) return { sent: 0 };
  const db = adminClient(); const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  if (!subs?.length) return { sent: 0 };
  const body = JSON.stringify(buildPushPayload(kind, data)); let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: kind === "call" ? "high" : "normal" }); sent++; }
    catch (e) { if (isGoneStatus((e as { statusCode?: number }).statusCode)) await db.from("push_subscriptions").delete().eq("id", s.id); }
  }));
  return { sent };
}
