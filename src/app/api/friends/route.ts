import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { pickStarterPet } from "@/modules/pets/starter";

const Add = z.object({ handle: z.string().regex(/^[a-z0-9_]{3,20}$/) });
const Accept = z.object({ friendshipId: z.string().uuid() });

/** Send a friend request by handle. */
export const POST = (req: Request) => authed(async ({ user }) => {
  const p = Add.safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: other } = await db.from("profiles").select("id").eq("handle", p.data.handle).maybeSingle();
  if (!other || other.id === user.id) throw new Error("bad_request");
  const [a, b] = [user.id, other.id].sort();
  const { data: me } = await db.from("profiles").select("tz").eq("id", user.id).single();
  const { data, error } = await db.from("friendships").upsert({ user_a: a, user_b: b, requested_by: user.id, tz: me?.tz ?? "UTC" }, { onConflict: "user_a,user_b", ignoreDuplicates: true }).select().maybeSingle();
  if (error) throw error;
  return { friendship: data };
});

/** Accept: creates the DM, progress row, and the shared starter pet atomically-ish on the server. */
export const PUT = (req: Request) => authed(async ({ user }) => {
  const p = Accept.safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: f } = await db.from("friendships").select("*").eq("id", p.data.friendshipId).single();
  if (!f || f.status !== "pending" || f.requested_by === user.id || ![f.user_a, f.user_b].includes(user.id)) throw new Error("forbidden");
  await db.from("friendships").update({ status: "accepted" }).eq("id", f.id);
  await db.from("friend_progress").upsert({ friendship_id: f.id });
  const { data: convo } = await db.from("conversations").insert({ kind: "dm", friendship_id: f.id, created_by: user.id }).select().single();
  await db.from("conversation_members").insert([{ conversation_id: convo!.id, user_id: f.user_a }, { conversation_id: convo!.id, user_id: f.user_b }]);
  await db.from("pets").insert({ friendship_id: f.id, ...pickStarterPet(f.id) });
  return { conversationId: convo!.id };
});
