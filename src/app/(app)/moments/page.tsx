"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, uploadMedia, useFriends, useMe } from "@/lib/data";
import { dayKey } from "@/lib/progression/time";
import { Media } from "@/modules/social/Media";
import { MOODS, promptForDay } from "@/modules/social/prompts";
import { StoryViewer, type Story } from "@/modules/social/StoryViewer";
import { usePrefs } from "@/lib/usePrefs";

interface Moment { id: string; author_id: string; kind: string; body: string | null; media_path: string | null; mood: string | null; prompt_id: string | null; audience: string; created_at: string; expires_at: string | null }
interface Reveal { friendship_id: string; day: string; user_id: string; media_path: string }

function StoryRow({ items, me, names, seen, muted, onOpen }: { items: Moment[]; me?: string; names: Map<string, string>; seen: Set<string>; muted: string[]; onOpen: (id: string) => void }) {
  const live = items.filter((m) => !m.expires_at || Date.parse(m.expires_at) > Date.now());
  const authors = [...new Set(live.map((m) => m.author_id))].filter((a) => !muted.includes(a));
  if (!authors.length) return null;
  return (
    <div className="row" style={{ margin: "12px 0", overflowX: "auto", flexWrap: "nowrap" }} aria-label="Stories">
      {authors.map((a) => { const unseen = a !== me && live.some((m) => m.author_id === a && !seen.has(m.id)); return (
        <button key={a} onClick={() => onOpen(a)} style={{ background: "none", border: 0, cursor: "pointer", textAlign: "center", color: "inherit" }} aria-label={`${names.get(a) ?? "Friend"}'s moments${unseen ? ", new" : ""}`}>
          <div style={{ width: 62, height: 62, borderRadius: 99, padding: 3, background: unseen ? "linear-gradient(135deg,var(--blue),var(--cyan))" : "var(--line)", display: "grid", placeItems: "center" }}>
            <div style={{ width: "100%", height: "100%", borderRadius: 99, background: "var(--bg)", display: "grid", placeItems: "center", fontWeight: 700 }}>{(names.get(a) ?? "?")[0]}</div></div>
          <div style={{ fontSize: ".75rem" }}>{names.get(a)}</div></button>); })}
    </div>);
}

export default function Moments() {
  const me = useMe(); const { friends } = useFriends(me); const [prefs] = usePrefs();
  const [viewing, setViewing] = useState<string | null>(null); const [seen, setSeen] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("ocean.mutedMoments") ?? "[]"); } catch { return []; } });
  const [permanent, setPermanent] = useState(false); const [picked, setPicked] = useState<string[]>([]); const [groupId, setGroupId] = useState(""); const [groups, setGroups] = useState<{ id: string; title: string }[]>([]); const [music, setMusic] = useState({ title: "", url: "" }); const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [tab, setTab] = useState<"feed" | "reveal" | "roll" | "recap">("feed");
  const [items, setItems] = useState<Moment[]>([]); const [reveals, setReveals] = useState<Reveal[]>([]);
  const [text, setText] = useState(""); const [mood, setMood] = useState(""); const [aud, setAud] = useState("friends"); const [file, setFile] = useState<File | null>(null); const [note, setNote] = useState("");
  const today = dayKey(new Date(), me?.tz ?? "UTC"); const prompt = promptForDay(today);
  const names = new Map<string, string>([[me?.id ?? "", "You"], ...(friends ?? []).map((f) => [f.other.id, f.other.display_name] as [string, string])]);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.from("moments").select("*").order("created_at", { ascending: false }).limit(100); setItems((data as Moment[]) ?? []);
    const { data: r } = await sb.from("double_reveals").select("*").eq("day", today); setReveals((r as Reveal[]) ?? []);
    const { data: v } = await sb.from("moment_views").select("moment_id").eq("viewer_id", me?.id ?? ""); setSeen(new Set((v ?? []).map((x) => x.moment_id)));
  }, [today, me?.id]);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => { if (me) supabase().from("conversations").select("id,title").eq("kind", "group").then(({ data }) => setGroups(data ?? [])); }, [me]);
  function shareLoc() { if (loc) return setLoc(null); navigator.geolocation?.getCurrentPosition((p) => { if (confirm("Attach your current location to this moment?")) setLoc({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 }); }, () => setNote("Couldn't get your location"), { timeout: 10_000 }); }

  async function post(e: React.FormEvent) {
    e.preventDefault(); if (!text.trim() && !file && !mood && !music.title.trim()) return; if (aud === "group" && !groupId) return setNote("Pick a group.");
    const mediaPath = file ? await uploadMedia(file, file.name.split(".").pop() ?? "jpg") : undefined;
    const hasMusic = music.title.trim().length > 0; const meta = { ...(hasMusic ? { title: music.title.trim().slice(0, 100), url: /^https?:\/\//.test(music.url.trim()) ? music.url.trim() : undefined } : {}), ...(loc ? { lat: loc.lat, lng: loc.lng, label: "Shared location" } : {}) };
    const r = await api("/api/moments", "POST", { kind: file ? "photo" : hasMusic && !text ? "music" : mood && !text ? "mood" : "text", body: text || undefined, mood: mood || undefined, mediaPath, audience: aud === "group" ? "selected" : aud, groupId: aud === "group" ? groupId || undefined : undefined, selected: aud === "selected" ? picked : [], meta: Object.keys(meta).length ? meta : undefined, permanent, promptId: prompt.id });
    setNote(r.error ? "Couldn't post." : "Shared ✨"); setText(""); setMood(""); setFile(null); setMusic({ title: "", url: "" }); setLoc(null); setPicked([]); load();
  }
  async function submitReveal(fid: string, f: File) {
    const path = await uploadMedia(f, f.name.split(".").pop() ?? "jpg");
    const r = await api<{ revealed: boolean }>("/api/reveal", "POST", { friendshipId: fid, mediaPath: path });
    setNote(r.revealed ? "Both in — revealed! 🎉" : "Locked in. Waiting for your friend…"); load();
  }
  const mine = items.filter((m) => m.author_id === me?.id);
  const month = mine.filter((m) => m.created_at.slice(0, 7) === today.slice(0, 7));

  return (<>
    <h1>✨ Moments</h1>
    <div className="glass card" style={{ marginBottom: 12 }}><span className="chip">Today's prompt</span> <b style={{ marginLeft: 8 }}>{prompt.text}</b></div>
    <div className="row" role="tablist">{([["feed", "Feed"], ["reveal", "Double reveal"], ["roll", "Camera roll"], ["recap", "Memory replay"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? "" : "ghost"}`} onClick={() => setTab(k)}>{l}</button>)}</div>
    {note && <p role="status" className="chip" style={{ marginTop: 10 }}>{note}</p>}

    {tab === "feed" && <>
      <StoryRow items={items} me={me?.id} names={names} seen={seen} muted={muted} onOpen={setViewing} />
      <form onSubmit={post} className="glass card" style={{ display: "grid", gap: 8, margin: "12px 0" }}>
        <textarea rows={2} placeholder="What's happening?" value={text} onChange={(e) => setText(e.target.value)} aria-label="Moment text" />
        <div className="row">{MOODS.map((m) => <button type="button" key={m} className={`chip`} style={{ border: m === mood ? "2px solid var(--blue)" : "2px solid transparent", cursor: "pointer" }} onClick={() => setMood(m === mood ? "" : m)}>{m}</button>)}</div>
        <div className="row"><label className="btn ghost" style={{ cursor: "pointer" }}>📎 Photo<input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>{file && <span className="muted">{file.name}</span>}
          <select value={aud} onChange={(e) => setAud(e.target.value)} aria-label="Audience" style={{ width: "auto" }}><option value="friends">All friends</option><option value="close">Close friends</option><option value="selected">Selected friends…</option><option value="group">A group…</option><option value="private">Only me</option></select><label className="chip"><input type="checkbox" style={{ width: "auto" }} checked={permanent} onChange={(e) => setPermanent(e.target.checked)} /> Keep as memory (no 24h expiry)</label><button className="btn">Share</button></div>
        {aud === "selected" && <div className="row" role="group" aria-label="Choose friends">{(friends ?? []).filter((f) => f.status === "accepted").map((f) => <label key={f.other.id} className="chip"><input type="checkbox" style={{ width: "auto" }} checked={picked.includes(f.other.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, f.other.id] : picked.filter((x) => x !== f.other.id))} />{f.other.display_name}</label>)}</div>}
        {aud === "group" && <select aria-label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">Choose a group…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}
        <div className="row"><input placeholder="🎵 Music (song – artist)" value={music.title} onChange={(e) => setMusic({ ...music, title: e.target.value })} maxLength={100} aria-label="Music title" style={{ flex: 1, minWidth: 160 }} /><input placeholder="Link (optional)" value={music.url} onChange={(e) => setMusic({ ...music, url: e.target.value })} aria-label="Music link" style={{ flex: 1, minWidth: 140 }} /><button type="button" className={`btn ${loc ? "" : "ghost"}`} onClick={shareLoc} aria-pressed={!!loc}>📍 {loc ? "Location on" : "Add location"}</button></div>
      </form>
      <div className="grid">{items.map((m) => (
        <article key={m.id} className="glass card">
          <div className="row"><b>{names.get(m.author_id) ?? "Friend"}</b><span className="muted">{new Date(m.created_at).toLocaleString()}</span>{m.audience === "private" && <span className="chip">🔒 only me</span>}</div>
          {m.media_path && <Media path={m.media_path} alt={m.body ?? "Moment"} video={m.kind === "video"} />}{m.mood && <p>{m.mood}</p>}{(m as Moment & { meta?: { title?: string; url?: string; lat?: number; lng?: number } }).meta?.title && <p>🎵 {(m as Moment & { meta: { title: string; url?: string } }).meta.url ? <a href={(m as Moment & { meta: { url: string } }).meta.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: "underline" }}>{(m as Moment & { meta: { title: string } }).meta.title}</a> : (m as Moment & { meta: { title: string } }).meta.title}</p>}{(m as Moment & { meta?: { lat?: number; lng?: number } }).meta?.lat !== undefined && <a className="chip" href={`https://www.openstreetmap.org/?mlat=${(m as Moment & { meta: { lat: number } }).meta.lat}&mlon=${(m as Moment & { meta: { lng: number } }).meta.lng}#map=15/${(m as Moment & { meta: { lat: number } }).meta.lat}/${(m as Moment & { meta: { lng: number } }).meta.lng}`} target="_blank" rel="noopener noreferrer">📍 Location</a>}{m.body && <p>{m.body}</p>}
        </article>))}
        {!items.length && <p className="muted">Nothing yet — share the first moment.</p>}</div>
      {viewing && <StoryViewer stories={items.filter((m) => m.author_id === viewing && (!m.expires_at || Date.parse(m.expires_at) > Date.now())).reverse() as Story[]} name={names.get(viewing) ?? "Friend"} meId={me!.id} reduced={prefs.reducedMotion} onClose={() => { setViewing(null); load(); }} onMute={() => { const n = [...muted, viewing]; setMuted(n); localStorage.setItem("ocean.mutedMoments", JSON.stringify(n)); }} />}</>}

    {tab === "reveal" && <div className="grid" style={{ marginTop: 12 }}>{friends?.filter((f) => f.status === "accepted").map((f) => {
      const mineR = reveals.find((r) => r.friendship_id === f.friendshipId && r.user_id === me?.id); const theirs = reveals.find((r) => r.friendship_id === f.friendshipId && r.user_id !== me?.id);
      return (<div key={f.friendshipId} className="glass card"><b>{f.other.display_name}</b><p className="muted">Both of you share a photo for "{prompt.text}" — then they appear together.</p>
        {mineR && theirs ? <div className="row"><div style={{ flex: 1 }}><Media path={mineR.media_path} alt="Your photo" /></div><div style={{ flex: 1 }}><Media path={theirs.media_path} alt={`${f.other.display_name}'s photo`} /></div></div>
          : mineR ? <p className="chip">Locked in 🔒 waiting for them</p>
          : <label className="btn" style={{ cursor: "pointer" }}>📸 Add my photo<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && submitReveal(f.friendshipId, e.target.files[0])} /></label>}</div>);
    })}</div>}

    {tab === "roll" && <div className="grid" style={{ marginTop: 12 }}>{mine.filter((m) => m.media_path).map((m) => <Media key={m.id} path={m.media_path!} alt="My moment" video={m.kind === "video"} />)}{!mine.some((m) => m.media_path) && <p className="muted">Your private photo roll fills as you share.</p>}</div>}

    {tab === "recap" && <div style={{ marginTop: 12 }}><h2>{new Date().toLocaleString(undefined, { month: "long" })} in moments</h2><p className="muted">{month.length} moments · {month.filter((m) => m.media_path).length} photos</p>
      <div className="grid">{month.filter((m) => m.media_path).slice(0, 12).map((m, i) => <div key={m.id} style={{ animation: `pop .5s ${i * 0.08}s both` }}><Media path={m.media_path!} alt="Recap" /></div>)}</div>
      <style>{`@keyframes pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}`}</style></div>}
  </>);
}
