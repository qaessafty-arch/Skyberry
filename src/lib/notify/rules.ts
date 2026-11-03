export type NotifyKind = "message" | "friend_request" | "group_invite" | "mention" | "reaction" | "missed_call" | "room_invite" | "moment";
export interface NotifySettings { notify?: Partial<Record<NotifyKind, boolean>>; quiet_hours?: { start: string; end: string } | null }

/** Minutes since midnight in a time zone. */
export function minutesNow(at: Date, tz: string): number {
  let z = tz; try { new Intl.DateTimeFormat("en", { timeZone: z }); } catch { z = "UTC"; }
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", minute: "2-digit", hour12: false }).format(at).split(":").map(Number);
  return (h % 24) * 60 + m;
}
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

/** Quiet hours may wrap midnight (22:00 → 07:00). */
export function inQuietHours(s: NotifySettings, at: Date, tz: string): boolean {
  const q = s.quiet_hours; if (!q) return false;
  const now = minutesNow(at, tz), a = toMin(q.start), b = toMin(q.end);
  return a === b ? false : a < b ? now >= a && now < b : now >= a || now < b;
}

/** In-app row is stored whenever the kind is enabled; push is additionally suppressed in quiet hours or for muted chats. */
export function decide(s: NotifySettings, kind: NotifyKind, ctx: { at: Date; tz: string; mutedUntil?: string | null }) {
  const enabled = s.notify?.[kind] ?? true;
  if (!enabled) return { store: false, push: false };
  const muted = !!ctx.mutedUntil && Date.parse(ctx.mutedUntil) > ctx.at.getTime();
  return { store: true, push: !muted && !inQuietHours(s, ctx.at, ctx.tz) };
}
