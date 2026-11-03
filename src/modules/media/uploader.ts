"use client";
import { api } from "@/lib/data";
import { optimizeTarget, messageKindFor, type MediaMsgKind } from "@/lib/media/helpers";
import { supabase } from "@/lib/supabase/browser";

const REASONS: Record<string, string> = { blocked_type: "That file type isn't allowed.", unsupported_type: "Unsupported file type.", too_large: "That file is too large.", empty: "That file is empty.", no_extension: "The file needs an extension.", quota_exceeded: "You're out of storage space." };

/** Downscale/re-encode large photos. Skipped for originals, GIFs and small files (see optimizeTarget). Falls back to the original on any failure. */
export async function maybeOptimize(file: File, original: boolean): Promise<File> {
  try {
    if (original || !file.type.startsWith("image/")) return file;
    const bmp = await createImageBitmap(file);
    const target = optimizeTarget(file, { w: bmp.width, h: bmp.height }, false);
    if (!target) { bmp.close(); return file; }
    const s = Math.min(1, target / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
    if (!out || out.size >= file.size) return file; // only keep it if it's actually smaller
    return new File([out], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export interface Uploaded { path: string; kind: MediaMsgKind }

/**
 * 1) ask the server to validate type/size/quota and mint a one-time signed URL, 2) PUT the bytes with real progress (XHR),
 * 3) caller then creates the message, which re-verifies the stored object. Supports cancel via AbortSignal.
 */
export async function uploadWithProgress(file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<Uploaded> {
  const r = await api<{ ok: boolean; reason?: string; path: string; token: string; signedUrl?: string; kind: "image" | "video" | "audio" | "file" }>("/api/upload-url", "POST", { name: file.name, type: file.type, size: file.size });
  if (r.error === "rate_limited") throw new Error("Too many uploads at once — wait a moment.");
  if (!r.ok) throw new Error(REASONS[r.reason ?? ""] ?? "Upload not allowed.");
  const form = new FormData(); form.append("cacheControl", "3600"); form.append("", file);
  const { data: sess } = await supabase().auth.getSession();
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", r.signedUrl!);
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    if (sess.session) x.setRequestHeader("Authorization", `Bearer ${sess.session.access_token}`);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error("Upload failed. Please retry.")));
    x.onerror = () => reject(new Error("Network error. Check your connection and retry."));
    x.onabort = () => reject(new DOMException("canceled", "AbortError"));
    signal.addEventListener("abort", () => x.abort(), { once: true });
    if (signal.aborted) return x.abort();
    x.send(form);
  });
  onProgress(100);
  return { path: r.path, kind: messageKindFor(r.kind) };
}
