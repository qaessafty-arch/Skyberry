import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit } from "@/modules/notify/service";

const TABLES: [string, string][] = [["profiles", "id"], ["friendships", "user_a"], ["messages", "sender_id"], ["moments", "author_id"], ["saved_items", "owner_id"], ["saved_collections", "owner_id"], ["memories", "owner_id"], ["notifications", "user_id"], ["user_settings", "user_id"], ["chat_customizations", "user_id"], ["blocks", "blocker"], ["close_friends", "owner_id"]];

/** Data export: everything the user authored or owns, as JSON. */
export const GET = () => authed(async ({ user }) => {
  limit("export", user.id, 3, 3_600_000);
  const db = adminClient(); const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
  for (const [t, col] of TABLES) out[t] = (await db.from(t).select("*").eq(col, user.id)).data ?? [];
  out.friendships = (await db.from("friendships").select("*").or(`user_a.eq.${user.id},user_b.eq.${user.id}`)).data ?? [];
  return out;
});

/** Account deletion: requires typing the handle; removes the auth user, which cascades to profile and owned rows, then their files. */
export const DELETE = (req: Request) => authed(async ({ user }) => {
  limit("delete-account", user.id, 3, 3_600_000);
  const p = z.object({ confirm: z.string() }).safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: me } = await db.from("profiles").select("handle").eq("id", user.id).single();
  if (!me || p.data.confirm !== me.handle) throw new Error("bad_request");
  const { data: files } = await db.storage.from("media").list(user.id, { limit: 1000 });
  if (files?.length) await db.storage.from("media").remove(files.map((f) => `${user.id}/${f.name}`));
  const { error } = await db.auth.admin.deleteUser(user.id); if (error) throw error;
  return { deleted: true };
});
