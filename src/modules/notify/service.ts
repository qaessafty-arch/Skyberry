import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { decide, type NotifyKind } from "@/lib/notify/rules";
import { RateLimiter } from "@/lib/security/rateLimit";

const limiters = new Map<string, RateLimiter>();
/** Throws "rate_limited" when the user exceeds `max` calls per `windowMs` for this bucket. */
export function limit(bucket: string, userId: string, max: number, windowMs = 60_000) {
  let l = limiters.get(bucket); if (!l) limiters.set(bucket, (l = new RateLimiter(max, windowMs)));
  if (!l.check(userId).ok) throw new Error("rate_limited");
}

/** Store an in-app notification (if the recipient allows that kind). Push delivery hooks in here (see docs/SETUP.md). */
export async function notify(userId: string, kind: NotifyKind, payload: Record<string, unknown>, opts: { mutedUntil?: string | null } = {}) {
  const db = adminClient();
  const [{ data: s }, { data: p }] = await Promise.all([db.from("user_settings").select("notify,quiet_hours").eq("user_id", userId).maybeSingle(), db.from("profiles").select("tz").eq("id", userId).single()]);
  const d = decide(s ?? {}, kind, { at: new Date(), tz: p?.tz ?? "UTC", mutedUntil: opts.mutedUntil });
  if (d.store) await db.from("notifications").insert({ user_id: userId, kind, payload });
  return d;
}

export async function isBlocked(a: string, b: string): Promise<boolean> {
  const { count } = await adminClient().from("blocks").select("*", { count: "exact", head: true }).or(`and(blocker.eq.${a},blocked.eq.${b}),and(blocker.eq.${b},blocked.eq.${a})`);
  return (count ?? 0) > 0;
}
