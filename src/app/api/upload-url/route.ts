import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { validateUpload, QUOTA_BYTES } from "@/lib/security/upload";
import { limit } from "@/modules/notify/service";

/** Validate BEFORE the bytes move, then hand back a one-time signed upload URL scoped to the caller's folder. */
export const POST = (req: Request) => authed(async ({ user }) => {
  limit("upload", user.id, 30);
  const p = z.object({ name: z.string().max(200), type: z.string().max(100), size: z.number() }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const v = validateUpload(p.data.name, p.data.type, p.data.size);
  if (!v.ok) return { ok: false, reason: v.reason };
  const db = adminClient();
  const { data: used } = await db.rpc("storage_used", { uid: user.id });
  if ((Number(used) || 0) + p.data.size > QUOTA_BYTES) return { ok: false, reason: "quota_exceeded" };
  const path = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${v.ext}`;
  const { data, error } = await db.storage.from("media").createSignedUploadUrl(path);
  if (error) throw error;
  return { ok: true, path, token: data.token, signedUrl: data.signedUrl, kind: v.kind, usedBytes: Number(used) || 0, quotaBytes: QUOTA_BYTES };
});
