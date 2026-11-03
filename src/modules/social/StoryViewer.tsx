"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api } from "@/lib/data";
import { Media } from "./Media";

export interface Story { id: string; author_id: string; kind: string; body: string | null; media_path: string | null; mood: string | null; created_at: string; expires_at: string | null }
const REACT = ["❤️", "😂", "🔥", "😮", "👏"];
const DURATION = 5000;

/** Fullscreen story viewer: tap sides to navigate, swipe down to close, auto-advance, private replies, reactions, viewers list for the author. */
export function StoryViewer({ stories, name, meId, start = 0, reduced, onClose, onMute }: { stories: Story[]; name: string; meId: string; start?: number; reduced?: boolean; onClose: () => void; onMute?: () => void }) {
  const [i, setI] = useState(start); const [pct, setPct] = useState(0); const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState(""); const [note, setNote] = useState(""); const [viewers, setViewers] = useState<{ viewer_id: string; viewed_at: string }[] | null>(null);
  const touch = useRef<number | null>(null);
  const s = stories[i]; const mine = s?.author_id === meId;

  const next = useCallback(() => { if (i + 1 >= stories.length) onClose(); else { setI(i + 1); setPct(0); setViewers(null); } }, [i, stories.length, onClose]);
  const prev = () => { setI(Math.max(0, i - 1)); setPct(0); };

  useEffect(() => { if (s && !mine) api(`/api/moments/${s.id}`, "POST", { action: "view" }); }, [s, mine]);
  useEffect(() => {
    if (paused || viewers) return; const t0 = Date.now() - pct * DURATION / 100;
    const id = setInterval(() => { const p = ((Date.now() - t0) / DURATION) * 100; if (p >= 100) next(); else setPct(p); }, 50);
    return () => clearInterval(id);
  }, [i, paused, viewers, next]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); });

  if (!s) return null;
  const act = async (b: Record<string, unknown>, ok: string) => { const r = await api(`/api/moments/${s.id}`, "POST", b); setNote(r.error ? "Couldn't do that" : ok); };
  async function showViewers() { const { data } = await supabase().from("moment_views").select("*").eq("moment_id", s.id); setViewers(data ?? []); }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${name}'s moments`} style={{ position: "fixed", inset: 0, zIndex: 50, background: "#031a33", display: "grid", placeItems: "center", animation: reduced ? undefined : "fadeIn .2s" }}
      onTouchStart={(e) => (touch.current = e.touches[0].clientY)} onTouchEnd={(e) => { if (touch.current !== null && e.changedTouches[0].clientY - touch.current > 90) onClose(); touch.current = null; }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}`}</style>
      <div style={{ width: "min(440px,100vw)", height: "min(100dvh,820px)", position: "relative", display: "flex", flexDirection: "column", color: "#fff" }}>
        <div style={{ display: "flex", gap: 4, padding: "10px 12px 0" }}>{stories.map((_, k) => <div key={k} style={{ flex: 1, height: 3, borderRadius: 3, background: "#ffffff44" }}><div style={{ height: "100%", borderRadius: 3, background: "#fff", width: k < i ? "100%" : k === i ? `${pct}%` : 0 }} /></div>)}</div>
        <div className="row" style={{ padding: "8px 12px", justifyContent: "space-between" }}>
          <b>{name} <span style={{ opacity: .7, fontWeight: 400 }}>{new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{s.expires_at ? " · disappears in 24h" : " · memory"}</span></b>
          <button className="btn ghost" onClick={onClose} aria-label="Close" style={{ color: "#fff", background: "#ffffff22" }}>✕</button>
        </div>
        <div style={{ flex: 1, position: "relative", display: "grid", placeItems: "center", padding: 12 }} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)}>
          {s.media_path ? <Media path={s.media_path} alt={s.body ?? "Moment"} style={{ maxHeight: "60dvh", objectFit: "contain" }} /> : <div style={{ fontSize: "1.8rem", textAlign: "center", padding: 24 }}>{s.mood} {s.body}</div>}
          {s.media_path && (s.body || s.mood) && <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", textShadow: "0 2px 8px #000" }}>{s.mood} {s.body}</div>}
          <button aria-label="Previous" onClick={prev} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%", background: "none", border: 0, cursor: "w-resize" }} />
          <button aria-label="Next" onClick={next} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%", background: "none", border: 0, cursor: "e-resize" }} />
        </div>
        {note && <div className="chip" role="status" style={{ alignSelf: "center" }}>{note}</div>}
        {viewers && <div className="glass" style={{ margin: 10, padding: 10, color: "var(--ink)" }}><b>Seen by {viewers.length}</b><div className="muted">{viewers.map((v) => v.viewer_id.slice(0, 6)).join(", ") || "No one yet"}</div></div>}
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          {!mine ? (<>
            <div className="row" style={{ justifyContent: "center" }}>{REACT.map((e) => <button key={e} className="btn ghost" style={{ background: "#ffffff22", color: "#fff" }} onClick={() => act({ action: "react", emoji: e }, `Sent ${e}`)} aria-label={`React ${e}`}>{e}</button>)}</div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { act({ action: "reply", body: reply.trim() }, "Reply sent privately"); setReply(""); } }}><input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply privately…" aria-label="Private reply" style={{ flex: 1 }} maxLength={1000} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} /><button className="btn">Send</button></form>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn ghost" style={{ color: "#fff", background: "#ffffff22" }} onClick={() => { onMute?.(); onClose(); }}>🔕 Mute {name}</button>
              <button className="btn ghost" style={{ color: "#fff", background: "#ffffff22" }} onClick={() => { const reason = prompt("What's wrong with this moment?") ?? undefined; act({ action: "report", reason }, "Reported. Thanks."); }}>⚑ Report</button>
            </div></>) : (
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn ghost" style={{ color: "#fff", background: "#ffffff22" }} onClick={showViewers}>👁 Who viewed</button>
              {s.expires_at && <button className="btn ghost" style={{ color: "#fff", background: "#ffffff22" }} onClick={() => act({ action: "keep" }, "Kept as a memory")}>💾 Keep as memory</button>}
            </div>)}
        </div>
      </div>
    </div>
  );
}
