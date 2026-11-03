import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit, notify } from "@/modules/notify/service";
import { pickStarterPet } from "@/modules/pets/starter";

const hash = (c: string) => createHash("sha256").update(c).digest("hex");

/** Create an invite. The raw code is returned ONCE; only its SHA-256 is stored. Default: single-use, 7 days. */
export const POST = (req: Request) => authed(async ({ user }) => {
  limit("invite-create", user.id, 10);
  const p = z.object({ conversationId: z.string().uuid().optional(), maxUses: z.number().int().min(1).max(100).default(1), days: z.number().int().min(1).max(30).default(7) }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  if (p.data.conversationId) {
    const { data: mem } = await db.from("conversation_members").select("role").eq("conversation_id", p.data.conversationId).eq("user_id", user.id).maybeSingle();
    if (!mem || mem.role === "member") throw new Error("forbidden");
  }
  const code = randomBytes(24).toString("base64url");
  await db.from("invites").insert({ code_hash: hash(code), created_by: user.id, conversation_id: p.data.conversationId ?? null, max_uses: p.data.maxUses, expires_at: new Date(Date.now() + p.data.days * 86_400_000).toISOString() });
  return { code };
});

/** Redeem: friend invite → accepted friendship + DM + pet; group invite → membership. Atomic use-count guard. */
export const PUT = (req: Request) => authed(async ({ user }) => {
  limit("invite-redeem", user.id, 10);
  const p = z.object({ code: z.string().min(20).max(80) }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: inv } = await db.from("invites").select("*").eq("code_hash", hash(p.data.code)).maybeSingle();
  if (!inv || inv.revoked || inv.uses >= inv.max_uses || Date.parse(inv.expires_at) < Date.now() || inv.created_by === user.id) throw new Error("forbidden");
  const { data: claimed } = await db.from("invites").update({ uses: inv.uses + 1 }).eq("id", inv.id).eq("uses", inv.uses).select("id"); // compare-and-set
  if (!claimed?.length) throw new Error("forbidden");
  if (inv.conversation_id) {
    await db.from("conversation_members").upsert({ conversation_id: inv.conversation_id, user_id: user.id }, { ignoreDuplicates: true });
    return { conversationId: inv.conversation_id };
  }
  const [a, b] = [user.id, inv.created_by].sort();
  const { data: f } = await db.from("friendships").upsert({ user_a: a, user_b: b, requested_by: inv.created_by, status: "accepted" }, { onConflict: "user_a,user_b" }).select().single();
  await db.from("friend_progress").upsert({ friendship_id: f!.id }, { ignoreDuplicates: true });
  let { data: convo } = await db.from("conversations").select("id").eq("friendship_id", f!.id).maybeSingle();
  if (!convo) {
    convo = (await db.from("conversations").insert({ kind: "dm", friendship_id: f!.id, created_by: user.id }).select("id").single()).data;
    await db.from("conversation_members").insert([a, b].map((id) => ({ conversation_id: convo!.id, user_id: id })));
    await db.from("pets").insert({ friendship_id: f!.id, ...pickStarterPet(f!.id) });
  }
  await notify(inv.created_by, "friend_request", { accepted: true, by: user.id });
  return { conversationId: convo!.id };
});
