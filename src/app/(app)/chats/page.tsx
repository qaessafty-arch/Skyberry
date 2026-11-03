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
import { StickerPicker } from "@/modules/stickers/StickerPicker";
import { VoiceRecorder } from "@/modules/media/VoiceRecorder";
import { DARES, TRIVIA, TRUTHS, pick } from "@/modules/social/games";
import { playSfx } from "@/lib/sounds";
import { useSwipe } from "@/lib/useSwipe";
import { MediaGallery } from "@/modules/media/MediaGallery";
import { useUploadQueue } from "@/modules/media/useUploadQueue";
import { UploadPanel } from "@/modules/media/UploadPanel";
import { DEFAULT_STYLE, sanitizeStyle, styleVars, type ChatStyle } from "@/modules/social/chatStyle";

const STICKERS = ["😂", "🥹", "🔥", "🫶", "🐙", "🦈", "🐬", "🌊", "🎉", "💙"];
const QUICK = ["❤️", "😂", "👍", "😮", "😢", "🔥"];
const WYR = [["Live underwater", "Live in the clouds"], ["Talk to animals", "Speak every language"], ["Beach forever", "Snow forever"]];
const PAGE = 40;
interface Receipt { message_id: string; user_id: string; read_at: string | null }
interface Failed { tempId: string; kind: string; body?: string; meta?: Record<string, unknown>; replyTo?: string }

function Chat() {
  const me = useMe();
  const { friends, reload } = useFriends(me);
  const q = useSearchParams();
  const router = useRouter();
  const [prefs] = usePrefs();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reacts, setReacts] = useState<Reaction[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [toast, setToast] = useState("");
  const [secret, setSecret] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Msg[] | null>(null);
  const [online, setOnline] = useState(true);
  const [groups, setGroups] = useState<{ id: string; title: string; announcement?: string | null; only_admins_post?: boolean }[]>([]);
  const [myRole, setMyRole] = useState<string>("member");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [style, setStyle] = useState<ChatStyle>(DEFAULT_STYLE);
  const [styling, setStyling] = useState(false);
  const soundsRef = useRef(false);
  soundsRef.current = prefs.sounds;
  const [stickerOpen, setStickerOpen] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [pane, setPane] = useState<"list" | "thread">("thread");
  const threadRef = useRef<HTMLElement>(null);
  useSwipe(threadRef, { onRight: () => setPane("list") });
  const [original, setOriginal] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const channel = useRef<ReturnType<ReturnType<typeof supabase>["channel"]> | null>(null);
  const lastTyping = useRef(0);

  const accepted = useMemo(() => friends?.filter((f) => f.status === "accepted") ?? [], [friends]);
  useEffect(() => {
    if (me) supabase().from("conversations").select("id,title,announcement,only_admins_post").eq("kind", "group").then(({ data }) => setGroups(data ?? []));
  }, [me]);
  const cid = q.get("c") ?? accepted[0]?.conversationId ?? groups[0]?.id;
  const active: Friend | undefined = accepted.find((f) => f.conversationId === cid);
  const group = groups.find((g) => g.id === cid);
  useEffect(() => { if (!group || !me) return; supabase().from("conversation_members").select("role").eq("conversation_id", group.id).eq("user_id", me.id).maybeSingle().then(({ data }) => setMyRole(data?.role ?? "member")); }, [group, me]);
  const locked = !!group?.only_admins_post && myRole === "member";
  const uploads = useUploadQueue(cid, { original, replyTo: replyTo?.id, onSent: () => setReplyTo(null) });
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dragProps = locked ? {} : {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true); },
    onDragOver: (e: React.DragEvent) => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: (e: React.DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragging(false); uploads.add(Array.from(e.dataTransfer.files)); },
  };
  const names = useMemo(() => new Map([[me?.id ?? "", "You"], ...accepted.map((f) => [f.other.id, f.other.display_name] as [string, string])]), [me, accepted]);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);

  // ── load newest page, then subscribe ──
  useEffect(() => {
    if (!cid || !me) return;
    const sb = supabase();
    let live = true;
    setLoading(true); setMsgs([]); setReplyTo(null); setEditing(null); setResults(null); setSearch("");
    (async () => {
      const { data } = await sb.from("messages").select("*").eq("conversation_id", cid).order("created_at", { ascending: false }).limit(PAGE);
      if (!live) return;
      const rows = ((data as Msg[]) ?? []).reverse();
      setMsgs(rows); setMore((data?.length ?? 0) === PAGE); setLoading(false);
      const ids = rows.map((m) => m.id);
      if (ids.length) {
        const [{ data: r }, { data: rc }, { data: sv }] = await Promise.all([
          sb.from("message_reactions").select("*").in("message_id", ids),
          sb.from("message_receipts").select("*").in("message_id", ids),
          sb.from("saved_items").select("message_id").in("message_id", ids),
        ]);
        if (live) { setReacts((r as Reaction[]) ?? []); setReceipts((rc as Receipt[]) ?? []); setSaved(new Set((sv ?? []).map((x) => x.message_id))); }
      }
      const { data: pn } = await sb.from("pinned_messages").select("message_id").eq("conversation_id", cid);
      if (live) setPins((pn ?? []).map((x) => x.message_id));
      await sb.from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", cid).eq("user_id", me.id);
      if (live) setUnread((u) => ({ ...u, [cid]: 0 }));
    })();
    const ch = sb.channel(`chat:${cid}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${cid}` }, (p) => { const nm = p.new as Msg; if (nm.sender_id !== me.id && soundsRef.current) playSfx(nm.kind === "sticker" ? "giggle" : "pop"); setMsgs((m) => (m.some((x) => x.id === nm.id) ? m : [...m, nm])); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${cid}` }, (p) => setMsgs((m) => m.map((x) => (x.id === (p.new as Msg).id ? (p.new as Msg) : x))))
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, async () => { const ids = (await sb.from("messages").select("id").eq("conversation_id", cid).order("created_at", { ascending: false }).limit(PAGE)).data?.map((x) => x.id) ?? []; const { data: r } = await sb.from("message_reactions").select("*").in("message_id", ids); setReacts((r as Reaction[]) ?? []); })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_receipts" }, (p) => { const r = p.new as Receipt; if (r?.message_id) setReceipts((all) => [...all.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id)), r]); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pinned_messages", filter: `conversation_id=eq.${cid}` }, async () => { const { data: pn } = await sb.from("pinned_messages").select("message_id").eq("conversation_id", cid); setPins((pn ?? []).map((x) => x.message_id)); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "friend_progress" }, () => reload())
      .on("broadcast", { event: "typing" }, ({ payload }) => setTyping((t) => ({ ...t, [payload.id]: Date.now() })))
      .subscribe();
    channel.current = ch;
    return () => { live = false; channel.current = null; sb.removeChannel(ch); };
  }, [cid, me, reload]);

  // per-conversation look (persists across sessions and devices via the DB)
  useEffect(() => {
    if (!cid || !me) return; setStyling(false);
    supabase().from("chat_customizations").select("settings").eq("user_id", me.id).eq("conversation_id", cid).maybeSingle().then(({ data }) => setStyle(sanitizeStyle(data?.settings)));
  }, [cid, me]);
  async function saveStyle(s: ChatStyle) { setStyle(s); if (cid && me) await supabase().from("chat_customizations").upsert({ user_id: me.id, conversation_id: cid, settings: s, updated_at: new Date().toISOString() }); }

  // sidebar unread counts
  useEffect(() => {
    if (!me) return;
    const sb = supabase();
    (async () => {
      const { data: mem } = await sb.from("conversation_members").select("conversation_id,last_read_at").eq("user_id", me.id);
      const out: Record<string, number> = {};
      await Promise.all((mem ?? []).map(async (m) => { const { count } = await sb.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", m.conversation_id).neq("sender_id", me.id).gt("created_at", m.last_read_at); out[m.conversation_id] = count ?? 0; }));
      setUnread(out);
    })();
  }, [me, msgs.length]);

  // mark incoming messages delivered/read while the tab is visible
  useEffect(() => {
    if (!me || document.hidden) return;
    const sb = supabase();
    const unseen = msgs.filter((m) => m.sender_id !== me.id && !receipts.some((r) => r.message_id === m.id && r.user_id === me.id && r.read_at));
    if (unseen.length) sb.from("message_receipts").upsert(unseen.map((m) => ({ message_id: m.id, user_id: me.id, read_at: new Date().toISOString() })));
  }, [msgs, receipts, me]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: prefs.reducedMotion ? "auto" : "smooth" }); }, [msgs.length, prefs.reducedMotion]);
  useEffect(() => { const t = setInterval(() => setTyping((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => Date.now() - v < 3500))), 1500); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  const events: PetEvent[] = useMemo(() => msgs.map((m) => ({ kind: m.kind === "sticker" ? "sticker" : "message", mine: m.sender_id === me?.id, at: Date.parse(m.created_at) })), [msgs, me]);
  const mood = usePetMood(events);

  async function loadOlder() {
    if (!cid || !msgs.length) return;
    const { data } = await supabase().from("messages").select("*").eq("conversation_id", cid).lt("created_at", msgs[0].created_at).order("created_at", { ascending: false }).limit(PAGE);
    setMsgs((m) => [...((data as Msg[]) ?? []).reverse(), ...m]); setMore((data?.length ?? 0) === PAGE);
  }

  const send = useCallback(async (kind: string, body?: string, meta?: Record<string, unknown>, reply?: string, retryId?: string) => {
    if (!cid) return;
    try {
      const r = await api<{ progress?: { milestones: { title: string }[]; evolved: unknown; settled: string | null } }>("/api/messages", "POST", { conversationId: cid, kind, body, meta, replyTo: reply });
      if (r.error) throw new Error(r.error);
      if (retryId) setFailed((f) => f.filter((x) => x.tempId !== retryId));
      const p = r.progress;
      if (p?.milestones?.length) setToast(`🎉 ${p.milestones[0].title}!`); else if (p?.evolved) setToast("✨ Your pet is evolving!"); else if (p?.settled) setToast("🔥 Streak day counted");
      if (p?.milestones?.length || p?.evolved || p?.settled) reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "rate_limited") return setToast("Slow down a little 🌊");
      if (!retryId) setFailed((f) => [...f, { tempId: crypto.randomUUID(), kind, body, meta, replyTo: reply }]);
    }
  }, [cid, reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    setText("");
    if (editing) { const r = await api(`/api/messages/${editing.id}`, "PATCH", { body: t }); setToast(r.error ? "Couldn't edit" : "Edited"); setEditing(null); return; }
    const reply = replyTo?.id; setReplyTo(null);
    await send(secret ? "secret" : "text", t, undefined, reply);
  }
  function onType(v: string) {
    setText(v);
    if (Date.now() - lastTyping.current > 2000 && me) { lastTyping.current = Date.now(); channel.current?.send({ type: "broadcast", event: "typing", payload: { id: me.id } }); }
  }
  async function vote(m: Msg, i: number) {
    const g = m.meta as { game?: string; options?: string[] };
    if (g.game === "tod" && g.options) { const choice = g.options[i]; await send("game", choice, { game: "tod-prompt", choice, prompt: pick(choice === "Truth" ? TRUTHS : DARES) }, m.id); return; }
    const sb = supabase();
    const mine = reacts.filter((r) => r.message_id === m.id && r.user_id === me!.id && r.emoji.startsWith("vote:"));
    for (const r of mine) await sb.from("message_reactions").delete().match({ message_id: m.id, user_id: me!.id, emoji: r.emoji });
    if (!mine.some((r) => r.emoji === `vote:${i}`)) await sb.from("message_reactions").insert({ message_id: m.id, user_id: me!.id, emoji: `vote:${i}` });
  }
  async function shareLocation() {
    if (!navigator.geolocation) return setToast("Location isn't available on this device");
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (confirm(`Share your current location with this chat?\n(${lat.toFixed(3)}, ${lng.toFixed(3)})`)) send("location", "📍 Location", { lat, lng, label: "Shared location" });
    }, (e) => setToast(e.code === e.PERMISSION_DENIED ? "Location permission was denied" : "Couldn't get your location"), { enableHighAccuracy: false, timeout: 10_000 });
  }
  async function react(m: Msg, emoji: string) {
    const sb = supabase();
    const has = reacts.some((r) => r.message_id === m.id && r.user_id === me!.id && r.emoji === emoji);
    if (has) await sb.from("message_reactions").delete().match({ message_id: m.id, user_id: me!.id, emoji });
    else await sb.from("message_reactions").insert({ message_id: m.id, user_id: me!.id, emoji });
    if (!has && prefs.sounds) playSfx("ding");
    setReacts((rs) => (has ? rs.filter((r) => !(r.message_id === m.id && r.user_id === me!.id && r.emoji === emoji)) : [...rs, { message_id: m.id, user_id: me!.id, emoji }])); setMenu(null);
  }
  async function forward(m: Msg) {
    const targets = [...accepted.filter((f) => f.conversationId).map((f) => ({ id: f.conversationId!, label: f.other.display_name })), ...groups.map((g) => ({ id: g.id, label: g.title }))].filter((t) => t.id !== cid);
    const pick = prompt(`Forward to:\n${targets.map((t, i) => `${i + 1}. ${t.label}`).join("\n")}\n\nEnter a number`);
    const t = targets[Number(pick) - 1]; if (!t) return;
    if (!["text", "sticker"].includes(m.kind)) return setToast("Only text and stickers can be forwarded for now");
    const r = await api("/api/messages", "POST", { conversationId: t.id, kind: m.kind, body: m.body, forwardedFrom: m.id });
    setToast(r.error ? "Couldn't forward" : `Forwarded to ${t.label}`); setMenu(null);
  }
  async function doSearch(e: React.FormEvent) {
    e.preventDefault(); const term = search.trim();
    if (!term || !cid) return setResults(null);
    const esc = term.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data } = await supabase().from("messages").select("*").eq("conversation_id", cid).is("deleted_at", null).ilike("body", `%${esc}%`).order("created_at", { ascending: false }).limit(30);
    setResults((data as Msg[]) ?? []);
  }

  if (!friends) return <div className="glass card" aria-busy><div className="skeleton" style={{ height: 24, width: "40%" }} /><div className="skeleton" style={{ height: 120, marginTop: 12 }} /></div>;
  if (!accepted.length && !groups.length) return <div className="glass card"><h2>No chats yet 🫧</h2><p className="muted">Add a friend (or share an invite link) to start chatting — and hatch your shared pet.</p><a className="btn" href="/friends">Find friends</a></div>;
  const sv = active ? streakView(active) : null;
  const pr = active?.progress;
  const lvl = pr ? levelForXp(pr.xp) : 1;
  const pct = pr ? ((pr.xp - xpForLevel(lvl)) / (xpForLevel(lvl + 1) - xpForLevel(lvl))) * 100 : 0;
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const otherId = active?.other.id;
  const someoneTyping = Object.keys(typing).filter((id) => id !== me?.id).map((id) => names.get(id) ?? "Someone");
  const status = (m: Msg) => {
    if (m.sender_id !== me?.id || m.deleted_at) return "";
    const rs = receipts.filter((r) => r.message_id === m.id && r.user_id !== me?.id);
    if (rs.some((r) => r.read_at)) return "✓✓ Read";
    return rs.length ? "✓✓ Delivered" : "✓ Sent";
  };
  const shown = results ?? msgs;

  return (
    <div className={`chat pane-${pane} ${gallery ? "with-gallery" : ""} ${prefs.reducedMotion ? "reduced" : ""}`}>
      <aside className="glass card" style={{ overflow: "auto" }} aria-label="Conversations">
        {groups.map((g) => (
          <button key={g.id} className={`btn ${g.id === cid ? "" : "ghost"}`} style={{ width: "100%", marginBottom: 8, textAlign: "left", display: "flex", justifyContent: "space-between" }} onClick={() => { setPane("thread"); router.push(`/chats?c=${g.id}`); }}>
            <span>🏝️ {g.title}</span>{unread[g.id] ? <span className="chip">{unread[g.id]}</span> : null}
          </button>
        ))}
        {accepted.map((f) => { const s = streakView(f); return (
          <button key={f.friendshipId} className={`btn ${f === active ? "" : "ghost"}`} style={{ width: "100%", marginBottom: 8, textAlign: "left", display: "flex", justifyContent: "space-between" }} onClick={() => { setPane("thread"); router.push(`/chats?c=${f.conversationId}`); }}>
            <span>{f.other.display_name}</span>
            <span>{f.conversationId && unread[f.conversationId] ? <span className="chip">{unread[f.conversationId]}</span> : null}{s.value > 0 && ` ${s.status === "resting" ? "🌙" : "🔥"} ${s.value}`}</span>
          </button>); })}
      </aside>
      <section ref={threadRef} className="glass thread" style={{ ...(styleVars(style) as React.CSSProperties), position: "relative" }} {...dragProps}>
        {dragging && <div role="presentation" style={{ position: "absolute", inset: 0, zIndex: 5, display: "grid", placeItems: "center", background: "rgba(10,132,255,.18)", border: "3px dashed var(--blue)", borderRadius: 22, pointerEvents: "none", fontWeight: 700, fontSize: "1.2rem" }}>Drop to share in this chat 🌊</div>}
        {!online && <div role="status" className="chip" style={{ margin: 8, background: "#ffe3e3" }}>You're offline — messages will wait to be sent. Check your connection.</div>}
        {group && <div style={{ padding: 12, borderBottom: "1px solid var(--line)" }}><div className="row" style={{ justifyContent: "space-between" }}><span><b>🏝️ {group.title}</b> <span className="muted">· group room</span></span><a className="btn ghost" href={`/rooms/${group.id}`}>⚙️ Group settings</a></div>{group.announcement && <div style={{ marginTop: 6 }} role="note">📣 {group.announcement}</div>}</div>}
        {active?.pet && (
          <div style={{ padding: 10, display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, alignItems: "center", borderBottom: "1px solid var(--line)" }}>
            <PetStage species={active.pet.species as SpeciesId} colors={active.pet.colors} equipped={active.pet.equipped} evolution={pr?.evolution ?? 0} personality={active.pet.personality as Personality} home={active.pet.home} mood={mood} height={120} lowPower={prefs.lowPower} reducedMotion={prefs.reducedMotion} />
            <div>
              <b>{active.pet.name}</b> <span className="chip">{EVOLUTION_STAGES[pr?.evolution ?? 0].name}</span> <span className="chip">Lv {lvl}</span>
              <div className="muted">with {active.other.display_name}{sv && sv.value > 0 && ` · ${sv.status === "resting" ? "🌙 resting" : "🔥"} ${sv.value}-day streak`}</div>
              <div style={{ height: 6, borderRadius: 9, background: "var(--line)", marginTop: 6 }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 9, background: "linear-gradient(90deg,var(--blue),var(--cyan))" }} /></div>
              {sv?.status === "resting" && <button className="btn ghost" style={{ marginTop: 6 }} onClick={async () => { const r = await api<{ restored: boolean }>("/api/streak", "POST", { friendshipId: active.friendshipId }); setToast(r.restored ? "🌊 Streak restored!" : "Can't restore right now"); reload(); }}>Restore streak (free)</button>}
              {otherId && <button className="btn ghost" style={{ marginTop: 6, marginLeft: 6 }} onClick={async () => { if (confirm(`Block ${active.other.display_name}? They won't be able to message you or see your moments.`)) { await api("/api/blocks", "POST", { userId: otherId, blocked: true }); setToast("Blocked"); } }}>Block</button>}
            </div>
          </div>)}
        <div className="row" style={{ padding: "6px 10px" }}><button className="btn ghost mobile-only" onClick={() => setPane("list")} aria-label="Back to conversations">‹ Chats</button><button className="btn ghost" onClick={() => setStyling(!styling)} aria-expanded={styling}>🎨 Customize chat</button><button className="btn ghost" onClick={() => setGallery(!gallery)} aria-expanded={gallery}>🖼️ Media</button></div>
        {styling && <div className="card" style={{ display: "grid", gap: 6, borderBottom: "1px solid var(--line)" }}>
          <div className="row"><label>Bubbles <input type="color" value={style.bubble} onChange={(e) => saveStyle({ ...style, bubble: e.target.value })} style={{ width: 50, padding: 2 }} /></label>
            <select aria-label="Background" value={style.bg} onChange={(e) => saveStyle({ ...style, bg: e.target.value as ChatStyle["bg"] })} style={{ width: "auto" }}><option value="none">Default</option><option value="ocean">Ocean</option><option value="deep">Deep sea</option><option value="sunset">Sunset</option><option value="mint">Mint</option><option value="custom">Custom colour</option></select>
            {style.bg === "custom" && <input type="color" aria-label="Background colour" value={style.bgColor} onChange={(e) => saveStyle({ ...style, bgColor: e.target.value })} style={{ width: 50, padding: 2 }} />}
            <select aria-label="Font" value={style.family} onChange={(e) => saveStyle({ ...style, family: e.target.value as ChatStyle["family"] })} style={{ width: "auto" }}><option value="system">System</option><option value="rounded">Rounded</option><option value="serif">Serif</option><option value="mono">Mono</option></select></div>
          <label>Text size {style.font}px<input type="range" min={12} max={22} value={style.font} onChange={(e) => setStyle({ ...style, font: +e.target.value })} onPointerUp={() => saveStyle(style)} onKeyUp={() => saveStyle(style)} /></label>
          <label>Bubble roundness<input type="range" min={4} max={28} value={style.radius} onChange={(e) => setStyle({ ...style, radius: +e.target.value })} onPointerUp={() => saveStyle(style)} onKeyUp={() => saveStyle(style)} /></label>
          <label>Spacing<input type="range" min={2} max={20} value={style.gap} onChange={(e) => setStyle({ ...style, gap: +e.target.value })} onPointerUp={() => saveStyle(style)} onKeyUp={() => saveStyle(style)} /></label>
          <div className="row"><button className="btn ghost" onClick={() => saveStyle(DEFAULT_STYLE)}>Reset</button><span className="muted">Changes preview live and sync to your other devices.</span></div></div>}
        <form onSubmit={doSearch} className="row" style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)" }} role="search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this conversation…" aria-label="Search messages" style={{ flex: 1 }} />
          {results && <button type="button" className="btn ghost" onClick={() => { setResults(null); setSearch(""); }}>Clear ({results.length})</button>}
        </form>
        {pins.length > 0 && !results && (
          <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--line)" }} aria-label="Pinned for everyone">
            📌 <b>Pinned for everyone:</b> {pins.slice(0, 2).map((id) => byId.get(id)?.body?.slice(0, 40)).filter(Boolean).join(" · ") || "…"}
          </div>)}
        <div className="msgs" role="log" aria-live="polite">
          {loading && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 38, width: `${40 + i * 15}%`, marginLeft: i % 2 ? "auto" : 0 }} />)}
          {!loading && !shown.length && <p className="muted" style={{ textAlign: "center" }}>{results ? "No matches." : "No messages yet — say hi 👋"}</p>}
          {more && !results && <button className="btn ghost" onClick={loadOlder} style={{ alignSelf: "center" }}>Load earlier messages</button>}
          {shown.map((m) => {
            const mine = m.sender_id === me?.id;
            const rp = m.reply_to ? byId.get(m.reply_to) : null;
            const rx = reacts.filter((r) => r.message_id === m.id && !r.emoji.startsWith("vote:"));
            return (
              <div key={m.id} className={`bubble ${mine ? "me" : ""}`}>
                {group && !mine && <div style={{ fontSize: ".75rem", opacity: .7 }}>{names.get(m.sender_id) ?? "Member"}</div>}
                {m.forwarded_from && <div style={{ fontSize: ".75rem", opacity: .7 }}>↪ Forwarded</div>}
                {rp && <div style={{ fontSize: ".8rem", opacity: .75, borderLeft: "3px solid currentColor", paddingLeft: 6, marginBottom: 4 }}>{rp.deleted_at ? "Deleted message" : (rp.body ?? "Media").slice(0, 60)}</div>}
                <MessageBody m={m} me={me!.id} reactions={reacts} onVote={(i) => vote(m, i)} />
                <div style={{ fontSize: ".72rem", opacity: .75, display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                  <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{m.edited_at && " · edited"}{pins.includes(m.id) && " · 📌"}{saved.has(m.id) && " · 🔖"} {status(m)}</span>
                  {!m.deleted_at && <button aria-label="Message actions" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)} style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", fontSize: "1rem" }}>⋯</button>}
                </div>
                {rx.length > 0 && <div style={{ fontSize: ".85rem" }}>{Object.entries(rx.reduce<Record<string, number>>((a, r) => ({ ...a, [r.emoji]: (a[r.emoji] ?? 0) + 1 }), {})).map(([e, n]) => `${e}${n > 1 ? n : ""}`).join(" ")}</div>}
                {menu === m.id && (
                  <div className="glass" role="menu" style={{ padding: 8, marginTop: 6, color: "var(--ink)", display: "grid", gap: 6 }}>
                    <div className="row">{QUICK.map((e) => <button key={e} className="btn ghost" style={{ padding: ".2em .5em" }} onClick={() => react(m, e)} aria-label={`React ${e}`}>{e}</button>)}</div>
                    <div className="row">
                      <button className="btn ghost" onClick={() => { setReplyTo(m); setMenu(null); }}>↩ Reply</button>
                      <button className="btn ghost" onClick={() => forward(m)}>↪ Forward</button>
                      {mine && ["text", "secret"].includes(m.kind) && <button className="btn ghost" onClick={() => { setEditing(m); setText(m.body ?? ""); setMenu(null); }}>✏️ Edit</button>}
                      <button className="btn ghost" onClick={async () => { const on = !pins.includes(m.id); const r = await api("/api/pins", "POST", { messageId: m.id, pinned: on }); setToast(r.error ? "Only admins can pin here" : on ? "Pinned for everyone" : "Unpinned"); setMenu(null); }}>📌 {pins.includes(m.id) ? "Unpin" : "Pin for everyone"}</button>
                      <button className="btn ghost" onClick={async () => { const on = !saved.has(m.id); await api("/api/saved", "POST", { messageId: m.id, saved: on }); setSaved((s) => { const n = new Set(s); if (on) n.add(m.id); else n.delete(m.id); return n; }); setToast(on ? "Saved privately" : "Removed from Saved"); setMenu(null); }}>🔖 {saved.has(m.id) ? "Unsave" : "Save (private)"}</button>
                      {(mine || group) && <button className="btn ghost" onClick={async () => { if (!confirm("Delete this message for everyone?")) return; const r = await api(`/api/messages/${m.id}`, "DELETE"); setToast(r.error ? "Couldn't delete" : "Deleted"); setMenu(null); }}>🗑 Delete</button>}
                    </div>
                  </div>)}
              </div>);
          })}
          {failed.map((f) => (
            <div key={f.tempId} className="bubble me" style={{ opacity: .8 }}>
              <span>{f.body ?? f.kind}</span>
              <div style={{ fontSize: ".75rem" }}>⚠️ Not sent <button className="btn ghost" style={{ padding: ".1em .6em", marginLeft: 6 }} onClick={() => send(f.kind, f.body, f.meta, f.replyTo, f.tempId)}>Retry</button></div>
            </div>))}
          <div ref={bottom} />
        </div>
        <div style={{ minHeight: 22, padding: "0 14px" }} className="muted" aria-live="polite">{someoneTyping.length > 0 && `${someoneTyping.join(", ")} ${someoneTyping.length > 1 ? "are" : "is"} typing…`}</div>
        {toast && <div className="chip" role="status" style={{ alignSelf: "center", marginBottom: 6 }}>{toast}</div>}
        <div style={{ padding: 10, borderTop: "1px solid var(--line)", display: "grid", gap: 8 }}>
          {(replyTo || editing) && <div className="chip" style={{ justifyContent: "space-between" }}>{editing ? "Editing message" : `Replying to ${(replyTo!.body ?? "media").slice(0, 40)}`}<button className="btn ghost" style={{ padding: ".1em .6em" }} onClick={() => { setReplyTo(null); setEditing(null); setText(""); }} aria-label="Cancel">✕</button></div>}
          {stickerOpen && <StickerPicker conversationId={cid} onClose={() => setStickerOpen(false)} onSticker={(st) => { send("sticker", st.name ?? "Sticker", { stickerId: st.id }); setStickerOpen(false); }} onEmoji={(e) => send("sticker", e)} onGif={(g) => { send("gif", "GIF", { url: g.url }); setStickerOpen(false); }} />}
          <UploadPanel uploads={uploads} />
          <div className="row">
            <button className="btn ghost" onClick={() => setStickerOpen(!stickerOpen)} aria-expanded={stickerOpen}>😀 Stickers &amp; GIFs</button>
            {STICKERS.slice(0, 5).map((s) => <button key={s} className="btn ghost" style={{ padding: ".3em .5em" }} aria-label={`Send ${s}`} onClick={() => send("sticker", s)}>{s}</button>)}
            <button className="btn ghost" onClick={() => { const [a, b] = WYR[Math.floor(Math.random() * WYR.length)]; send("game", "Would you rather…", { q: "Would you rather…", options: [a, b] }); }}>🎲 Would you rather</button>
            <button className="btn ghost" onClick={() => { const q2 = prompt("Poll question?"); if (!q2) return; const o = prompt("Options, comma-separated")?.split(",").map((x) => x.trim()).filter(Boolean); if (o && o.length > 1) send("poll", q2, { q: q2, options: o.slice(0, 6) }); }}>📊 Poll</button>
            <button className="btn ghost" onClick={() => send("game", "Truth or Dare?", { game: "tod", q: "Truth or Dare?", options: ["Truth", "Dare"] })}>🎭 Truth or dare</button>
            <button className="btn ghost" onClick={() => { const t = pick(TRIVIA); send("game", t.q, { game: "trivia", q: t.q, options: t.options, answer: t.answer }); }}>🧠 Trivia</button>
            <button className="btn ghost" onClick={shareLocation} aria-label="Share my location">📍 Location</button>
            <button className="btn ghost" onClick={() => { const item = prompt("What's the surprise? (e.g. a virtual cake)"); if (item) send("surprise", "A surprise for you!", { item }); }}>🎁 Surprise</button>
          </div>
          {locked && <div className="muted" role="status">Only admins can send messages in this group.</div>}
          <form className="row" onSubmit={submit} aria-disabled={locked} style={locked ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
            <input style={{ flex: 1 }} value={text} onChange={(e) => onType(e.target.value)} onPaste={(e) => { const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); uploads.add(fs); } }} placeholder={secret ? "Secret message (tap to reveal)…" : "Message…"} aria-label="Message" maxLength={4000} />
            <VoiceRecorder disabled={locked} onSend={(f) => uploads.add([f], { kind: "voice" })} />
            <label className="btn ghost" style={{ cursor: "pointer", padding: ".5em .8em" }} aria-label="Attach files">📎<input type="file" multiple hidden onChange={(e) => { uploads.add(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
            <label className="chip" title="Skip photo compression"><input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} style={{ width: "auto" }} />Original quality</label>
            <label className="chip"><input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} style={{ width: "auto" }} />🔒</label>
            <button className="btn">{editing ? "Save" : "Send"}</button>
          </form>
        </div>
      </section>
      {gallery && cid && <MediaGallery conversationId={cid} onClose={() => setGallery(false)} />}
    </div>
  );
}
export default function Page() { return <Suspense fallback={<p className="muted">Loading…</p>}><Chat /></Suspense>; }
