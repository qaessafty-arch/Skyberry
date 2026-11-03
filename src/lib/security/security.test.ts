import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rateLimit";
import { validateUpload } from "./upload";
import { decide, inQuietHours } from "../notify/rules";

describe("rate limiter", () => {
  it("blocks after max within the window and recovers", () => {
    const r = new RateLimiter(3, 1000);
    expect([0, 1, 2].map((i) => r.check("u", i).ok)).toEqual([true, true, true]);
    const blocked = r.check("u", 10); expect(blocked.ok).toBe(false); expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(r.check("u", 1500).ok).toBe(true);
    expect(r.check("other", 10).ok).toBe(true);
  });
});

describe("upload validation", () => {
  it("accepts matching ext+mime within limits", () => expect(validateUpload("pic.JPG", "image/jpeg", 1000)).toMatchObject({ ok: true, kind: "image" }));
  it("rejects mismatched mime", () => expect(validateUpload("pic.jpg", "text/html", 1000)).toMatchObject({ ok: false }));
  it("rejects active content even when disguised", () => {
    expect(validateUpload("evil.html", "text/html", 10)).toMatchObject({ ok: false, reason: "blocked_type" });
    expect(validateUpload("evil.html.jpg", "image/jpeg", 10)).toMatchObject({ ok: false, reason: "blocked_type" });
    expect(validateUpload("logo.svg", "image/svg+xml", 10)).toMatchObject({ ok: false });
  });
  it("enforces size limits per kind", () => {
    expect(validateUpload("a.png", "image/png", 26 * 1024 * 1024)).toMatchObject({ ok: false, reason: "too_large" });
    expect(validateUpload("a.mp4", "video/mp4", 100 * 1024 * 1024)).toMatchObject({ ok: true, kind: "video" });
    expect(validateUpload("a.zip", "application/zip", 0)).toMatchObject({ ok: false });
  });
});

describe("notification rules", () => {
  const at = new Date("2026-03-01T23:30:00Z");
  it("handles quiet hours that wrap midnight, per time zone", () => {
    const s = { quiet_hours: { start: "22:00", end: "07:00" } };
    expect(inQuietHours(s, at, "UTC")).toBe(true);
    expect(inQuietHours(s, new Date("2026-03-01T12:00:00Z"), "UTC")).toBe(false);
    expect(inQuietHours(s, at, "Asia/Tokyo")).toBe(false); // 08:30 local
  });
  it("disabled kinds are neither stored nor pushed; quiet/muted only suppress push", () => {
    expect(decide({ notify: { reaction: false } }, "reaction", { at, tz: "UTC" })).toEqual({ store: false, push: false });
    expect(decide({ quiet_hours: { start: "22:00", end: "07:00" } }, "message", { at, tz: "UTC" })).toEqual({ store: true, push: false });
    expect(decide({}, "message", { at, tz: "UTC", mutedUntil: "2026-03-02T00:00:00Z" })).toEqual({ store: true, push: false });
    expect(decide({}, "message", { at, tz: "UTC" })).toEqual({ store: true, push: true });
  });
});
