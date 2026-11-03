"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, uploadMedia, useFriends, useMe } from "@/lib/data";
import { dayKey } from "@/lib/progression/time";
import { Media } from "@/modules/social/Media";
import { MOODS, promptForDay } from "@/modules/social/prompts";

interface Moment { id: string; author_id: string; kind: string; body: string | null; media_path: string | null; mood: string | null; prompt_id: string | null; audience: string; created_at: string }
interface Reveal { friendship_id: string; day: string; user_id: string; media_path: string }

export default function Moments() {
  const me = useMe(); const { friends } = useFriends(me);
  const [tab, setTab] = useState<"feed" | "reveal" | "roll" | "recap">("feed");
  const [items, setItems] = useState<Moment[]>([]); const [reveals, setReveals] = useState<Reveal[]>([]);
  const [text, setText] = useState(""); const [mood, setMood] = useState(""); const [aud, setAud] = useState("friends"); const [file, setFile] = useState<File | null>(null); const [note, setNote] = useState("");
  const today = dayKey(new Date(), me?.tz ?? "UTC"); const prompt = promptForDay(today);
  const names = new Map<string, string>([[me?.id ?? "", "You"], ...(friends ?? []).map((f) => [f.other.id, f.other.display_name] as [string, string])]);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.from("moments").select("*").order("created_at", { ascending: false }).limit(100); setItems((data as Moment[]) ?? []);
    const { data: r } = await sb.from("double_reveals").select("*").eq("day", today); setReveals((r as Reveal[]) ?? []);
  }, [today]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function post(e: React.FormEvent) {
    e.preventDefault(); if (!text.trim() && !file && !mood) return;
    const mediaPath = file ? await uploadMedia(file, file.name.split(".").pop() ?? "jpg") : undefined;
    const r = await api("/api/moments", "POST", { kind: file ? "photo" : mood && !text ? "mood" : "text", body: text || undefined, mood: mood || undefined, mediaPath, audience: aud, promptId: prompt.id });
    setNote(r.error ? "Couldn't post." : "Shared ✨"); setText(""); setMood(""); setFile(null); load();
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
      <form onSubmit={post} className="glass card" style={{ display: "grid", gap: 8, margin: "12px 0" }}>
        <textarea rows={2} placeholder="What's happening?" value={text} onChange={(e) => setText(e.target.value)} aria-label="Moment text" />
        <div className="row">{MOODS.map((m) => <button type="button" key={m} className={`chip`} style={{ border: m === mood ? "2px solid var(--blue)" : "2px solid transparent", cursor: "pointer" }} onClick={() => setMood(m === mood ? "" : m)}>{m}</button>)}</div>
        <div className="row"><label className="btn ghost" style={{ cursor: "pointer" }}>📎 Photo<input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>{file && <span className="muted">{file.name}</span>}
          <select value={aud} onChange={(e) => setAud(e.target.value)} aria-label="Audience" style={{ width: "auto" }}><option value="friends">All friends</option><option value="private">Only me</option></select><button className="btn">Share</button></div>
      </form>
      <div className="grid">{items.map((m) => (
        <article key={m.id} className="glass card">
          <div className="row"><b>{names.get(m.author_id) ?? "Friend"}</b><span className="muted">{new Date(m.created_at).toLocaleString()}</span>{m.audience === "private" && <span className="chip">🔒 only me</span>}</div>
          {m.media_path && <Media path={m.media_path} alt={m.body ?? "Moment photo"} />}{m.mood && <p>{m.mood}</p>}{m.body && <p>{m.body}</p>}
        </article>))}
        {!items.length && <p className="muted">Nothing yet — share the first moment.</p>}</div></>}

    {tab === "reveal" && <div className="grid" style={{ marginTop: 12 }}>{friends?.filter((f) => f.status === "accepted").map((f) => {
      const mineR = reveals.find((r) => r.friendship_id === f.friendshipId && r.user_id === me?.id); const theirs = reveals.find((r) => r.friendship_id === f.friendshipId && r.user_id !== me?.id);
      return (<div key={f.friendshipId} className="glass card"><b>{f.other.display_name}</b><p className="muted">Both of you share a photo for "{prompt.text}" — then they appear together.</p>
        {mineR && theirs ? <div className="row"><div style={{ flex: 1 }}><Media path={mineR.media_path} alt="Your photo" /></div><div style={{ flex: 1 }}><Media path={theirs.media_path} alt={`${f.other.display_name}'s photo`} /></div></div>
          : mineR ? <p className="chip">Locked in 🔒 waiting for them</p>
          : <label className="btn" style={{ cursor: "pointer" }}>📸 Add my photo<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && submitReveal(f.friendshipId, e.target.files[0])} /></label>}</div>);
    })}</div>}

    {tab === "roll" && <div className="grid" style={{ marginTop: 12 }}>{mine.filter((m) => m.media_path).map((m) => <Media key={m.id} path={m.media_path!} alt="My moment" />)}{!mine.some((m) => m.media_path) && <p className="muted">Your private photo roll fills as you share.</p>}</div>}

    {tab === "recap" && <div style={{ marginTop: 12 }}><h2>{new Date().toLocaleString(undefined, { month: "long" })} in moments</h2><p className="muted">{month.length} moments · {month.filter((m) => m.media_path).length} photos</p>
      <div className="grid">{month.filter((m) => m.media_path).slice(0, 12).map((m, i) => <div key={m.id} style={{ animation: `pop .5s ${i * 0.08}s both` }}><Media path={m.media_path!} alt="Recap" /></div>)}</div>
      <style>{`@keyframes pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}`}</style></div>}
  </>);
}
