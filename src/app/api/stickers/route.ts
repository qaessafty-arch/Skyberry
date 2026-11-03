import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit, notify } from "@/modules/notify/service";
import { validateUpload } from "@/lib/security/upload";
import { canDecideConsent, normalizeTags } from "@/lib/stickers/logic";

const Create = z.object({
  packId: z.string().uuid().optional(), mediaPath: z.string().max(300), name: z.string().max(40).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(), animated: z.boolean().default(false),
  /** Set when the photo shows ANOTHER person. They must approve before anyone can use the sticker. */
  subjectId: z.string().uuid().optional(),
});

/** Create a sticker from an already-uploaded image. Verifies the stored object, then applies the consent rules. */
export const POST = (req: Request) => authed(async ({ user }) => {
  limit("sticker-create", user.id, 20);
  const p = Create.safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const b = p.data; const db = adminClient();
  if (!b.mediaPath.startsWith(`${user.id}/`) || b.mediaPath.includes("..")) throw new Error("bad_request");
  const [folder, file] = [b.mediaPath.split("/")[0], b.mediaPath.split("/").slice(1).join("/")];
  const obj = (await db.storage.from("media").list(folder, { search: file, limit: 5 })).data?.find((o) => o.name === file);
  const meta = obj?.metadata as { size?: number; mimetype?: string } | null | undefined;
  const v = obj && meta ? validateUpload(file, meta.mimetype ?? "", Number(meta.size ?? 0)) : null;
  if (!v?.ok || v.kind !== "image" || Number(meta?.size) > 2 * 1024 * 1024) throw new Error("bad_request"); // stickers: images up to 2 MB

  let packId = b.packId;
  if (packId) { const { data: pk } = await db.from("sticker_packs").select("owner_id").eq("id", packId).maybeSingle(); if (!pk || pk.owner_id !== user.id) throw new Error("forbidden"); }
  else {
    const { data: ex } = await db.from("sticker_packs").select("id").eq("owner_id", user.id).eq("name", "My stickers").is("conversation_id", null).maybeSingle();
    packId = ex?.id ?? (await db.from("sticker_packs").insert({ owner_id: user.id, name: "My stickers" }).select("id").single()).data!.id;
  }
  let subject: string | null = null;
  if (b.subjectId && b.subjectId !== user.id) {
    const [x, y] = [user.id, b.subjectId].sort();
    const { data: f } = await db.from("friendships").select("id").eq("user_a", x).eq("user_b", y).eq("status", "accepted").maybeSingle();
    if (!f) throw new Error("forbidden");
    subject = b.subjectId;
  }
  const { data: st, error } = await db.from("stickers").insert({ pack_id: packId, owner_id: user.id, media_path: b.mediaPath, name: b.name ?? null, tags: normalizeTags(b.tags ?? []), animated: b.animated, subject_id: subject, consent: subject ? "pending" : "self" }).select().single();
  if (error) throw error;
  if (subject) await notify(subject, "sticker_request", { stickerId: st.id, by: user.id });
  return { sticker: st, needsConsent: !!subject };
});

/** The pictured person approves or declines. Declining deletes the sticker's usefulness (it stays hidden from everyone else). */
export const PATCH = (req: Request) => authed(async ({ user }) => {
  const p = z.object({ stickerId: z.string().uuid(), decision: z.enum(["approved", "declined"]) }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: s } = await db.from("stickers").select("subject_id,consent").eq("id", p.data.stickerId).maybeSingle();
  if (!s || !canDecideConsent(s, user.id)) throw new Error("forbidden");
  await db.from("stickers").update({ consent: p.data.decision }).eq("id", p.data.stickerId);
  return { ok: true };
});
