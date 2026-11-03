import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { validSubscription } from "@/lib/push/payload";
import { limit } from "@/modules/notify/service";
import { pushConfigured } from "@/modules/notify/push";

/** Register this browser for push. The subscription is bound to the signed-in user. */
export const POST = (req: Request) => authed(async ({ user }) => {
  limit("push-sub", user.id, 10);
  if (!pushConfigured()) return { ok: false, reason: "not_configured" };
  const sub = (await req.json())?.subscription;
  if (!validSubscription(sub)) throw new Error("bad_request");
  const { error } = await adminClient().from("push_subscriptions").upsert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) throw error; return { ok: true };
});

export const DELETE = (req: Request) => authed(async ({ user }) => {
  const endpoint = (await req.json())?.endpoint; if (typeof endpoint !== "string") throw new Error("bad_request");
  await adminClient().from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint); return { ok: true };
});
