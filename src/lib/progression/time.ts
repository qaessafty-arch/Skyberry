/** Time-zone-aware "friendship day" helpers. All progression is keyed by YYYY-MM-DD in the friendship's tz. */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar day (YYYY-MM-DD) of an instant in the given IANA time zone. */
export function dayKey(at: Date, tz: string): string {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from a to b (b - a). Both are YYYY-MM-DD; DST-safe because we use UTC midnights. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}
