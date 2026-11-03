import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { record } from "@/modules/progression/service";
import type { InteractionKind } from "@/lib/progression/interactions";

const Body = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["text", "image", "voice", "sticker", "secret", "surprise", "poll", "game"]),
  body: z.string().max(4000).optional(),
  mediaPath: z.string().max(300).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const progressKind = (k: string): InteractionKind | null =>
  k === "text" || k === "secret" ? "message" : k === "image" ? "photo" : k === "voice" ? "voice" : k === "game" ? "challenge" : null;

export const POST = (req: Request) => authed(async ({ user }) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new Error("bad_request");
  const b = parsed.data;
  const db = adminClient();

  // Membership is verified on the server, not assumed from the client.
  const { data: member } = await db.from("conversation_members").select("user_id").eq("conversation_id", b.conversationId).eq("user_id", user.id).maybeSingle();
  if (!member) throw new Error("forbidden");
  // Media must live in the sender's own folder.
  if (b.mediaPath && !b.mediaPath.startsWith(`${user.id}/`)) throw new Error("bad_request");

  const { data: msg, error } = await db.from("messages").insert({
    conversation_id: b.conversationId, sender_id: user.id, kind: b.kind, body: b.body ?? null, media_path: b.mediaPath ?? null, meta: b.meta ?? {},
  }).select().single();
  if (error) throw error;

  let progress = null;
  const pk = progressKind(b.kind);
  const { data: convo } = await db.from("conversations").select("friendship_id").eq("id", b.conversationId).single();
  if (pk && convo?.friendship_id) progress = await record(user.id, convo.friendship_id, pk, b.body ?? "");
  return { message: msg, progress: progress && { counted: progress.counted, xpGained: progress.xpGained, settled: progress.settled, evolved: progress.evolved, milestones: progress.milestones, levelUp: progress.levelUp } };
});
