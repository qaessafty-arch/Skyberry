import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit, notify, isBlocked } from "@/modules/notify/service";
import { can, type Role } from "@/lib/groups/permissions";

type Ctx = { params: Promise<{ id: string }> };

/** Loads the group and the caller's role; non-members and non-groups are indistinguishable ("forbidden"). */
async function load(id: string, userId: string) {
  const db = adminClient();
  const { data: c } = await db.from("conversations").select("*").eq("id", id).eq("kind", "group").maybeSingle();
  const { data: me } = await db.from("conversation_members").select("role").eq("conversation_id", id).eq("user_id", userId).maybeSingle();
  if (!c || !me) throw new Error("forbidden");
  return { db, c, role: me.role as Role };
}
const roleOf = async (db: ReturnType<typeof adminClient>, id: string, userId: string) =>
  ((await db.from("conversation_members").select("role").eq("conversation_id", id).eq("user_id", userId).maybeSingle()).data?.role ?? null) as Role | null;

const Settings = z.object({
  title: z.string().min(1).max(40).optional(), description: z.string().max(300).nullable().optional(), announcement: z.string().max(500).nullable().optional(),
  onlyAdminsPost: z.boolean().optional(), avatarPath: z.string().max(300).nullable().optional(),
});

export const PATCH = (req: Request, ctx: Ctx) => authed(async ({ user }) => {
  limit("group-edit", user.id, 30);
  const { db, c, role } = await load((await ctx.params).id, user.id);
  if (!can(role, "editSettings")) throw new Error("forbidden");
  const p = Settings.safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const s = p.data;
  if (s.avatarPath && !s.avatarPath.startsWith(`${user.id}/`)) throw new Error("bad_request");
  const patch: Record<string, unknown> = {};
  if (s.title !== undefined) patch.title = s.title;
  if (s.description !== undefined) patch.description = s.description || null;
  if (s.announcement !== undefined) patch.announcement = s.announcement || null;
  if (s.onlyAdminsPost !== undefined) patch.only_admins_post = s.onlyAdminsPost;
  if (s.avatarPath !== undefined) patch.avatar_path = s.avatarPath;
  if (Object.keys(patch).length) await db.from("conversations").update(patch).eq("id", c.id);
  return { ok: true };
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), userId: z.string().uuid() }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
  z.object({ action: z.literal("setRole"), userId: z.string().uuid(), role: z.enum(["admin", "member"]) }),
  z.object({ action: z.literal("transfer"), userId: z.string().uuid() }),
  z.object({ action: z.literal("leave") }),
]);

export const POST = (req: Request, ctx: Ctx) => authed(async ({ user }) => {
  limit("group-member", user.id, 40);
  const { db, c, role } = await load((await ctx.params).id, user.id);
  const p = Action.safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const a = p.data;

  if (a.action === "leave") {
    const { count } = await db.from("conversation_members").select("*", { count: "exact", head: true }).eq("conversation_id", c.id);
    if (!can(role, "leave", undefined, { onlyMember: count === 1 })) throw new Error("forbidden");
    if (count === 1) { await db.from("conversations").delete().eq("id", c.id); return { ok: true, deleted: true }; }
    await db.from("conversation_members").delete().eq("conversation_id", c.id).eq("user_id", user.id);
    return { ok: true };
  }

  if (a.action === "add") {
    if (!can(role, "addMember")) throw new Error("forbidden");
    if (await roleOf(db, c.id, a.userId)) return { ok: true }; // already a member
    // Only friends of the person adding, and never across a block.
    const [x, y] = [user.id, a.userId].sort();
    const { data: f } = await db.from("friendships").select("id").eq("user_a", x).eq("user_b", y).eq("status", "accepted").maybeSingle();
    if (!f || (await isBlocked(user.id, a.userId))) throw new Error("forbidden");
    await db.from("conversation_members").insert({ conversation_id: c.id, user_id: a.userId, role: "member" });
    await notify(a.userId, "group_invite", { conversationId: c.id, title: c.title, by: user.id });
    return { ok: true };
  }

  const target = await roleOf(db, c.id, a.userId);
  if (!target) throw new Error("forbidden");
  if (a.action === "remove") {
    if (!can(role, "removeMember", target)) throw new Error("forbidden");
    await db.from("conversation_members").delete().eq("conversation_id", c.id).eq("user_id", a.userId);
    await db.from("pinned_messages").delete().eq("conversation_id", c.id).in("message_id", (await db.from("messages").select("id").eq("conversation_id", c.id).eq("sender_id", a.userId)).data?.map((m) => m.id) ?? []);
    return { ok: true };
  }
  if (a.action === "setRole") {
    if (!can(role, "setRole", target)) throw new Error("forbidden");
    await db.from("conversation_members").update({ role: a.role }).eq("conversation_id", c.id).eq("user_id", a.userId);
    return { ok: true };
  }
  // transfer ownership: demote self first so the one-owner unique index is never violated
  if (!can(role, "transferOwner", target)) throw new Error("forbidden");
  await db.from("conversation_members").update({ role: "admin" }).eq("conversation_id", c.id).eq("user_id", user.id);
  const { error } = await db.from("conversation_members").update({ role: "owner" }).eq("conversation_id", c.id).eq("user_id", a.userId);
  if (error) { await db.from("conversation_members").update({ role: "owner" }).eq("conversation_id", c.id).eq("user_id", user.id); throw error; } // roll back
  return { ok: true };
});

/** Delete the whole group (owner only). Cascades messages, pins, members. */
export const DELETE = (_req: Request, ctx: Ctx) => authed(async ({ user }) => {
  limit("group-delete", user.id, 5);
  const { db, c, role } = await load((await ctx.params).id, user.id);
  if (!can(role, "deleteGroup")) throw new Error("forbidden");
  await db.from("conversations").delete().eq("id", c.id);
  return { ok: true };
});
