/** Server-side upload policy. The client's declared type is never trusted alone: extension and MIME must agree. */
const MB = 1024 * 1024;
export const UPLOAD_POLICY = {
  image: { exts: ["jpg", "jpeg", "png", "webp", "gif", "avif"], mimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"], max: 25 * MB },
  video: { exts: ["mp4", "webm", "mov"], mimes: ["video/mp4", "video/webm", "video/quicktime"], max: 512 * MB },
  audio: { exts: ["mp3", "m4a", "ogg", "wav", "webm"], mimes: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"], max: 50 * MB },
  file: { exts: ["pdf", "txt", "zip", "docx", "xlsx", "pptx", "csv"], mimes: ["application/pdf", "text/plain", "application/zip", "application/x-zip-compressed", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/csv"], max: 100 * MB },
} as const;
export type UploadKind = keyof typeof UPLOAD_POLICY;
/** Never accepted, even if renamed: active content that could run in the browser. */
const BLOCKED_EXT = new Set(["html", "htm", "svg", "js", "mjs", "exe", "bat", "cmd", "sh", "php", "jar", "apk", "msi", "dll", "scr"]);

export function validateUpload(name: string, mime: string, size: number): { ok: true; kind: UploadKind; ext: string } | { ok: false; reason: string } {
  const parts = name.toLowerCase().split(".");
  if (parts.length < 2) return { ok: false, reason: "no_extension" };
  if (parts.slice(1).some((p) => BLOCKED_EXT.has(p))) return { ok: false, reason: "blocked_type" }; // catches evil.html.jpg too
  const ext = parts.at(-1)!;
  mime = mime.split(";")[0].trim(); // "audio/webm;codecs=opus" → "audio/webm"
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: "empty" };
  for (const kind of Object.keys(UPLOAD_POLICY) as UploadKind[]) {
    const p = UPLOAD_POLICY[kind] as { exts: readonly string[]; mimes: readonly string[]; max: number };
    if (p.exts.includes(ext) && p.mimes.includes(mime.toLowerCase())) return size > p.max ? { ok: false, reason: "too_large" } : { ok: true, kind, ext };
  }
  return { ok: false, reason: "unsupported_type" };
}
export const QUOTA_BYTES = 2 * 1024 * MB; // 2 GiB per user (configurable)
