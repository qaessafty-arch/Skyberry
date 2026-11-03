import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { pickStarterPet } from "@/modules/pets/starter";

/** Create a group room. Members must all be accepted friends of the creator. */
export const POST = (req: Request) => authed(async ({ user }) => {
  const p = z.object({ title: z.string().min(1).max(40), members: z.array(z.string().uuid()).min(1).max(30) }).safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const db = adminClient();
  const { data: fr } = await db.from("friendships").select("user_a,user_b").eq("status", "accepted").or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
  const friends = new Set((fr ?? []).map((f) => (f.user_a === user.id ? f.user_b : f.user_a)));
  const members = [...new Set(p.data.members.filter((m) => friends.has(m)))];
  if (!members.length) throw new Error("forbidden");
  const { data: c } = await db.from("conversations").insert({ kind: "group", title: p.data.title, created_by: user.id }).select().single();
  await db.from("conversation_members").insert([user.id, ...members].map((id) => ({ conversation_id: c!.id, user_id: id, role: id === user.id ? "owner" : "member" })));
  return { conversationId: c!.id, starterPet: pickStarterPet(c!.id) };
});
