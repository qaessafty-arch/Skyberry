import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";

const B = z.object({ messageId: z.string().uuid(), saved: z.boolean(), note: z.string().max(500).optional(), collectionId: z.string().uuid().optional() });
const KIND: Record<string, string> = { text: "message", secret: "message", poll: "message", game: "message", surprise: "message", image: "photo", voice: "voice", sticker: "sticker" };

/** Save a message PRIVATELY. We confirm via RLS that the caller can actually read it first. */
export const POST = (req: Request) => authed(async ({ sb, user }) => {
  const p = B.safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  if (!p.data.saved) { await adminClient().from("saved_items").delete().eq("owner_id", user.id).eq("message_id", p.data.messageId); return { ok: true }; }
  const { data: m } = await sb.from("messages").select("id,kind,body,media_path,deleted_at").eq("id", p.data.messageId).maybeSingle(); // RLS: members only
  if (!m || m.deleted_at) throw new Error("forbidden");
  if (p.data.collectionId) { const { data: c } = await sb.from("saved_collections").select("id").eq("id", p.data.collectionId).maybeSingle(); if (!c) throw new Error("forbidden"); }
  const { error } = await adminClient().from("saved_items").upsert({ owner_id: user.id, message_id: m.id, kind: KIND[m.kind] ?? "message", title: (m.body ?? "").slice(0, 80) || null, media_path: null, note: p.data.note ?? null, collection_id: p.data.collectionId ?? null }, { onConflict: "owner_id,message_id", ignoreDuplicates: false });
  if (error) throw error; return { ok: true };
});
