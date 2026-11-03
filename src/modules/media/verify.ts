import "server-only";
import type { adminClient } from "@/lib/supabase/server";
import { validateUpload, type UploadKind } from "@/lib/security/upload";

/**
 * Confirms an object really exists in the user's own folder and that its STORED type/size pass the upload policy.
 * Never trusts the client's claim about what a file is. Returns null when anything is off.
 */
export async function verifyStoredMedia(db: ReturnType<typeof adminClient>, userId: string, path: string): Promise<{ kind: UploadKind; size: number; mime: string; file: string } | null> {
  if (!path.startsWith(`${userId}/`) || path.includes("..")) return null;
  const folder = path.split("/")[0], file = path.split("/").slice(1).join("/");
  const { data } = await db.storage.from("media").list(folder, { search: file, limit: 5 });
  const obj = data?.find((o) => o.name === file); if (!obj) return null;
  const meta = obj.metadata as { size?: number; mimetype?: string } | null; const size = Number(meta?.size ?? 0), mime = String(meta?.mimetype ?? "");
  const v = validateUpload(file, mime, size); return v.ok ? { kind: v.kind, size, mime, file } : null;
}
