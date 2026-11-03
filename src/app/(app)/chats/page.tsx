"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { api, streakView, useFriends, useMe, type Friend } from "@/lib/data";
import { usePrefs } from "@/lib/usePrefs";
import { levelForXp, xpForLevel } from "@/lib/progression/interactions";
import { EVOLUTION_STAGES } from "@/lib/progression/milestones";
import { PetStage } from "@/modules/social/Pet";
import { MessageBody, type Msg, type Reaction } from "@/modules/social/Message";
import { usePetMood, type PetEvent } from "@/modules/social/usePetMood";
import type { SpeciesId, Personality } from "@/modules/pets/catalog";

const STICKERS = ["😂", "🥹", "🔥", "🫶", "🐙", "🦈", "🐬", "🌊", "🎉", "💙"];
const WYR = [["Live underwater", "Live in the clouds"], ["Talk to animals", "Speak every language"], ["Beach forever", "Snow forever"]];

function Chat() {
  const me = useMe(); const { friends, reload } = useFriends(me);
  const q = useSearchParams(); const router = useRouter();
  const [prefs] = usePrefs();
  const [msgs, setMsgs] = useState<Msg[]>([]); const [reacts, setReacts] = useState<Reaction[]>([]);
  const [text, setText] = useState(""); const [toast, setToast] = useState(""); const [secret, setSecret] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const accepted = friends?.filter((f) => f.status === "accepted") ?? [];
  const [groups, setGroups] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => { if (me) supabase().from("conversations").select("id,title").eq("kind", "group").then(({ data }) => setGroups(data ?? [])); }, [me]);
  const wanted = q.get("c");
  const cid = wanted ?? accepted[0]?.conversationId ?? groups[0]?.id;
  const active: Friend | undefined = accepted.find((f) => f.conversationId === cid);
  const group = groups.find((g) => g.id === cid);

  useEffect(() => {
    if (!cid) return; const sb = supabase(); let live = true;
    (async () => {
      const { data } = await sb.from("messages").select("*").eq("conversation_id", cid).order("created_at").limit(200); if (live) setMsgs((data as Msg[]) ?? []);
      const ids = (data ?? []).map((m) => m.id);
      if (ids.length) { const { data: r } = await sb.from("message_reactions").select("*").in("message_id", ids); if (live) setReacts((r as Reaction[]) ?? []); }
    })();
    const ch = sb.channel(`chat:${cid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${cid}` }, (p) => setMsgs((m) => m.some((x) => x.id === (p.new as Msg).id) ? m : [...m, p.new as Msg]))
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, async () => { const { data: r } = await sb.from("message_reactions").select("*"); setReacts((r as Reaction[]) ?? []); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "friend_progress" }, () => reload())
      .subscribe();
    return () => { live = false; sb.removeChannel(ch); };
  }, [cid, reload]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: prefs.reducedMotion ? "auto" : "smooth" }); }, [msgs.length, prefs.reducedMotion]);

  const events: PetEvent[] = useMemo(() => msgs.map((m) => ({ kind: m.kind === "sticker" ? "sticker" : "message", mine: m.sender_id === me?.id, at: Date.parse(m.created_at) })), [msgs, me]);
  const mood = usePetMood(events);

  const send = useCallback(async (kind: string, body?: string, meta?: Record<string, unknown>) => {
    if (!cid) return;
    const r = await api<{ progress?: { milestones: { title: string }[]; evolved: unknown; settled: string | null } }>("/api/messages", "POST", { conversationId: cid, kind, body, meta });
    if (r.error) return setToast("Couldn't send — try again");
    const p = r.progress; if (p?.milestones?.length) setToast(`🎉 ${p.milestones[0].title}!`); else if (p?.evolved) setToast("✨ Your pet is evolving!"); else if (p?.settled) setToast("🔥 Streak day counted");
    if (p?.milestones?.length || p?.evolved || p?.settled) reload();
  }, [cid, reload]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  async function vote(m: Msg, i: number) {
    const sb = supabase(); const mine = reacts.filter((r) => r.message_id === m.id && r.user_id === me!.id && r.emoji.startsWith("vote:"));
    for (const r of mine) await sb.from("message_reactions").delete().match({ message_id: m.id, user_id: me!.id, emoji: r.emoji });
    if (!mine.some((r) => r.emoji === `vote:${i}`)) await sb.from("message_reactions").insert({ message_id: m.id, user_id: me!.id, emoji: `vote:${i}` });
  }
  async function react(m: Msg, emoji: string) { await supabase().from("message_reactions").upsert({ message_id: m.id, user_id: me!.id, emoji }); }

  if (!friends) return <p className="muted">Loading…</p>;
  if (!accepted.length && !groups.length) return <div className="glass card"><h2>No chats yet 🫧</h2><p className="muted">Add a friend to start chatting — and hatch your shared pet.</p><a className="btn" href="/friends">Find friends</a></div>;
  const sv = active ? streakView(active) : null; const pr = active?.progress;
  const lvl = pr ? levelForXp(pr.xp) : 1; const pct = pr ? ((pr.xp - xpForLevel(lvl)) / (xpForLevel(lvl + 1) - xpForLevel(lvl))) * 100 : 0;

  return (
    <div className={`chat ${prefs.reducedMotion ? "reduced" : ""}`}>
      <aside className="glass card" style={{ overflow: "auto" }} aria-label="Conversations">
        {groups.map((g) => <button key={g.id} className={`btn ${g.id === cid ? "" : "ghost"}`} style={{ width: "100%", marginBottom: 8, textAlign: "left" }} onClick={() => router.push(`/chats?c=${g.id}`)}>🏝️ {g.title}</button>)}
        {accepted.map((f) => { const s = streakView(f); return (
          <button key={f.friendshipId} className={`btn ${f === active ? "" : "ghost"}`} style={{ width: "100%", marginBottom: 8, textAlign: "left", display: "flex", justifyContent: "space-between" }} onClick={() => router.push(`/chats?c=${f.conversationId}`)}>
            <span>{f.other.display_name}</span>{s.value > 0 && <span>{s.status === "resting" ? "🌙" : "🔥"} {s.value}</span>}
          </button>); })}
      </aside>
      <section className="glass thread">
        {group && <div style={{ padding: 12, borderBottom: "1px solid var(--line)" }}><b>🏝️ {group.title}</b> <span className="muted">· group room</span></div>}
        {active?.pet && (
          <div style={{ padding: 10, display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, alignItems: "center", borderBottom: "1px solid var(--line)" }}>
            <PetStage species={active.pet.species as SpeciesId} colors={active.pet.colors} equipped={active.pet.equipped} evolution={pr?.evolution ?? 0} personality={active.pet.personality as Personality} home={active.pet.home} mood={mood} height={120} lowPower={prefs.lowPower} reducedMotion={prefs.reducedMotion} />
            <div>
              <b>{active.pet.name}</b> <span className="chip">{EVOLUTION_STAGES[pr?.evolution ?? 0].name}</span> <span className="chip">Lv {lvl}</span>
              {active.other && <div className="muted">with {active.other.display_name}{sv && sv.value > 0 && ` · ${sv.status === "resting" ? "🌙 resting" : "🔥"} ${sv.value}-day streak`}</div>}
              <div style={{ height: 6, borderRadius: 9, background: "var(--line)", marginTop: 6 }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 9, background: "linear-gradient(90deg,var(--blue),var(--cyan))" }} /></div>
              {sv?.status === "resting" && <button className="btn ghost" style={{ marginTop: 6 }} onClick={async () => { const r = await api<{ restored: boolean }>("/api/streak", "POST", { friendshipId: active.friendshipId }); setToast(r.restored ? "🌊 Streak restored!" : "Can't restore right now"); reload(); }}>Restore streak (free)</button>}
            </div>
          </div>)}
        <div className="msgs" role="log" aria-live="polite">
          {msgs.map((m) => (
            <div key={m.id} className={`bubble ${m.sender_id === me?.id ? "me" : ""}`} onDoubleClick={() => react(m, "❤️")}>
              <MessageBody m={m} me={me!.id} reactions={reacts} onVote={(i) => vote(m, i)} />
              <div style={{ fontSize: ".75rem", opacity: .7 }}>{reacts.filter((r) => r.message_id === m.id && !r.emoji.startsWith("vote:")).map((r) => r.emoji).join(" ")}</div>
            </div>))}
          <div ref={bottom} />
        </div>
        {toast && <div className="chip" role="status" style={{ alignSelf: "center", marginBottom: 6 }}>{toast}</div>}
        <div style={{ padding: 10, borderTop: "1px solid var(--line)", display: "grid", gap: 8 }}>
          <div className="row">
            {STICKERS.map((s) => <button key={s} className="btn ghost" style={{ padding: ".3em .5em" }} aria-label={`Send ${s}`} onClick={() => send("sticker", s)}>{s}</button>)}
            <button className="btn ghost" onClick={() => { const [a, b] = WYR[Math.floor(Math.random() * WYR.length)]; send("game", "Would you rather…", { q: "Would you rather…", options: [a, b] }); }}>🎲 Would you rather</button>
            <button className="btn ghost" onClick={() => { const q = prompt("Poll question?"); if (!q) return; const o = prompt("Options, comma-separated")?.split(",").map((x) => x.trim()).filter(Boolean); if (o && o.length > 1) send("poll", q, { q, options: o.slice(0, 6) }); }}>📊 Poll</button>
            <button className="btn ghost" onClick={() => { const item = prompt("What's the surprise? (e.g. a virtual cake)"); if (item) send("surprise", "A surprise for you!", { item }); }}>🎁 Surprise</button>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; send(secret ? "secret" : "text", t); setText(""); }}>
            <input style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={secret ? "Secret message (tap to reveal)…" : "Message…"} aria-label="Message" maxLength={4000} />
            <label className="chip"><input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} style={{ width: "auto" }} />🔒</label>
            <button className="btn">Send</button>
          </form>
        </div>
      </section>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<p className="muted">Loading…</p>}><Chat /></Suspense>; }
