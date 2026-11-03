import { z } from "zod";
import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { limit, notify } from "@/modules/notify/service";

const B = z.discriminatedUnion("action", [
  z.object({ action: z.literal("view") }),
  z.object({ action: z.literal("react"), emoji: z.string().min(1).max(16) }),
  z.object({ action: z.literal("report"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("reply"), body: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("keep") }),
]);

/** Every action first proves the caller can SEE the moment (RLS on their own client), so audience rules are enforced server-side. */
export const POST = (req: Request, ctx: { params: Promise<{ id: string }> }) => authed(async ({ sb, user }) => {
  limit("moment-act", user.id, 60);
  const id = (await ctx.params).id;
  const p = B.safeParse(await req.json()); if (!p.success) throw new Error("bad_request");
  const { data: m } = await sb.from("moments").select("id,author_id,expires_at").eq("id", id).maybeSingle();
  if (!m) throw new Error("forbidden");
  const db = adminClient();
  switch (p.data.action) {
    case "view": if (m.author_id !== user.id) await db.from("moment_views").upsert({ moment_id: id, viewer_id: user.id }, { ignoreDuplicates: true }); break;
    case "react":
      await db.from("moment_reactions").upsert({ moment_id: id, user_id: user.id, emoji: p.data.emoji });
      if (m.author_id !== user.id) await notify(m.author_id, "reaction", { momentId: id, by: user.id, emoji: p.data.emoji });
      break;
    case "report": await db.from("moment_reports").upsert({ moment_id: id, reporter: user.id, reason: p.data.reason ?? null }); break;
    case "reply": {
      // Private reply = a DM message to the author referencing the moment.
      if (m.author_id === user.id) throw new Error("bad_request");
      const [a, b] = [user.id, m.author_id].sort();
      const { data: f } = await db.from("friendships").select("id").eq("user_a", a).eq("user_b", b).eq("status", "accepted").maybeSingle();
      const { data: c } = f ? await db.from("conversations").select("id").eq("friendship_id", f.id).maybeSingle() : { data: null };
      if (!c) throw new Error("forbidden");
      await db.from("messages").insert({ conversation_id: c.id, sender_id: user.id, kind: "text", body: p.data.body, meta: { replyToMoment: id } });
      await notify(m.author_id, "message", { conversationId: c.id, momentReply: id });
      break;
    }
    case "keep": // author turns an expiring story into a permanent memory
      if (m.author_id !== user.id) throw new Error("forbidden");
      await db.from("moments").update({ expires_at: null }).eq("id", id);
      await db.from("saved_items").insert({ owner_id: user.id, kind: "memory", title: "Moment memory", url: `moment:${id}` });
      break;
  }
  return { ok: true };
});
