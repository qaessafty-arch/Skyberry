import type { UploadKind } from "@/lib/security/upload";

export type MediaMsgKind = "image" | "video" | "audio" | "file";
/** Upload policy kind → chat message kind. */
/** Files above this use the resumable (TUS) protocol; smaller ones use a single request. */
export const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
export const messageKindFor = (k: UploadKind): MediaMsgKind => k;
export type GalleryTab = "photos" | "videos" | "audio" | "files";
export const TAB_KINDS: Record<GalleryTab, string[]> = { photos: ["image"], videos: ["video"], audio: ["audio", "voice"], files: ["file"] };

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"]; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/** Strip path tricks and control chars from a client-supplied display name; the stored object name is server-generated anyway. */
export function safeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120);
  return clean || "file";
}

/**
 * Should we re-encode this image before upload? Only big, non-animated raster images, and never when the user
 * chose "send original". Returns the target long edge, or null to upload as-is.
 */
export function optimizeTarget(f: { type: string; size: number }, dims: { w: number; h: number }, original: boolean, maxEdge = 2560): number | null {
  if (original) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return null; // gif/avif untouched (animation, support)
  const long = Math.max(dims.w, dims.h);
  if (long > maxEdge) return maxEdge;
  if (f.size > 6 * 1024 * 1024) return long; // heavy file at a sane resolution: re-encode only
  return null;
}

export interface QueueItem { id: string; name: string; size: number; progress: number; status: "queued" | "uploading" | "paused" | "sending" | "done" | "error" | "canceled"; error?: string }
/** Next queued item to start given a concurrency limit, or null. */
export function nextToStart(items: QueueItem[], concurrency = 2): QueueItem | null {
  const active = items.filter((i) => i.status === "uploading" || i.status === "sending").length;
  return active >= concurrency ? null : items.find((i) => i.status === "queued") ?? null;
}
export const overallProgress = (items: QueueItem[]) => {
  const live = items.filter((i) => i.status !== "canceled");
  const total = live.reduce((a, i) => a + i.size, 0);
  return total ? Math.round((live.reduce((a, i) => a + (i.status === "done" ? i.size : i.size * (i.progress / 100)), 0) / total) * 100) : 0;
};
