import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { friendshipFor, record, todayFor } from "@/modules/progression/service";
import { CARE, validEquip, validHome } from "@/modules/pets/catalog";

const Care = z.object({ friendshipId: z.string().uuid(), action: z.enum(["feed", "play", "clean", "gift"]) });
const Customize = z.object({
  friendshipId: z.string().uuid(),
  name: z.string().min(1).max(24).optional(),
  colors: z.object({ body: z.string().regex(/^#[0-9a-f]{6}$/i), accent: z.string().regex(/^#[0-9a-f]{6}$/i) }).optional(),
  equipped: z.array(z.string()).max(8).optional(),
  home: z.string().optional(),
  personality: z.string().optional(),
});

/** Care is collaborative and gentle: each person can do each action a few times a day; nothing ever decays into punishment. */
export const POST = (req: Request) => authed(async ({ user }) => {
  const p = Care.safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const row = await friendshipFor(user.id, p.data.friendshipId);
  const db = adminClient();
  const { data: pet } = await db.from("pets").select("*").eq("friendship_id", row.id).single();
  const day = todayFor(row);
  const { count } = await db.from("pet_care_log").select("*", { count: "exact", head: true }).eq("pet_id", pet!.id).eq("user_id", user.id).eq("action", p.data.action).eq("day", day);
  if ((count ?? 0) >= CARE.perActionPerDay) return { done: false, reason: "enough_for_today" };
  await db.from("pet_care_log").insert({ pet_id: pet!.id, user_id: user.id, action: p.data.action, day });
  const bump = (v: number, n: number) => Math.min(100, v + n);
  await db.from("pets").update({ hunger: p.data.action === "feed" ? bump(pet!.hunger, 15) : pet!.hunger, joy: p.data.action !== "feed" ? bump(pet!.joy, 10) : pet!.joy }).eq("id", pet!.id);
  const r = await record(user.id, row.id, "pet_care");
  return { done: true, xpGained: r.xpGained };
});

export const PATCH = (req: Request) => authed(async ({ user }) => {
  const p = Customize.safeParse(await req.json());
  if (!p.success) throw new Error("bad_request");
  const row = await friendshipFor(user.id, p.data.friendshipId);
  const db = adminClient();
  const { data: pet } = await db.from("pets").select("*").eq("friendship_id", row.id).single();
  const { data: prog } = await db.from("friend_progress").select("unlocked,evolution").eq("friendship_id", row.id).single();
  const patch: Record<string, unknown> = {};
  if (p.data.name) patch.name = p.data.name;
  if (p.data.colors) patch.colors = p.data.colors;
  if (p.data.personality) patch.personality = p.data.personality;
  // Only unlocked items can be equipped / homes selected: validated server-side.
  if (p.data.equipped) { if (!validEquip(p.data.equipped, prog!.unlocked, prog!.evolution)) throw new Error("forbidden"); patch.equipped = p.data.equipped; }
  if (p.data.home) { if (!validHome(p.data.home, prog!.unlocked)) throw new Error("forbidden"); patch.home = p.data.home; }
  await db.from("pets").update(patch).eq("id", pet!.id);
  return { ok: true };
});
