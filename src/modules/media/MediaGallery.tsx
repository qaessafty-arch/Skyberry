"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, signedUrl } from "@/lib/data";
import { formatBytes, TAB_KINDS, type GalleryTab } from "@/lib/media/helpers";
import { useVisible } from "./useVisible";

interface Item { id: string; sender_id: string; kind: string; media_path: string; body: string | null; meta: { name?: string; size?: number; mime?: string }; created_at: string }
const PAGE = 36;
const TABS: [GalleryTab, string][] = [["photos", "Photos"], ["videos", "Videos"], ["audio", "Audio"], ["files", "Files"]];

function Thumb({ it, onOpen }: { it: Item; onOpen: () => void }) {
  const [ref, seen] = useVisible<HTMLButtonElement>(); const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (seen && it.kind === "image") signedUrl(it.media_path).then(setUrl); }, [seen, it]);
  return (
    <button ref={ref} onClick={onOpen} aria-label={`Open ${it.kind} from ${new Date(it.created_at).toLocaleDateString()}`} style={{ aspectRatio: "1", border: 0, borderRadius: 12, overflow: "hidden", background: "var(--line)", cursor: "pointer", padding: 0, position: "relative" }}>
      {it.kind === "image" ? (url ? <img src={url} alt={it.meta.name ?? "Photo"} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null) : <span style={{ fontSize: "2rem" }}>🎬</span>}
    </button>);
}

/** Full-screen viewer for photos and videos with next/previous, keyboard support and download. */
function Viewer({ items, index, onClose, setIndex }: { items: Item[]; index: number; onClose: () => void; setIndex: (i: number) => void }) {
  const it = items[index]; const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { setUrl(null); if (it) signedUrl(it.media_path).then(setUrl); }, [it]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight" && index < items.length - 1) setIndex(index + 1); if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [index, items.length, onClose, setIndex]);
  if (!it) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Media viewer" style={{ position: "fixed", inset: 0, zIndex: 60, background: "#021428ee", display: "grid", gridTemplateRows: "auto 1fr", color: "#fff" }}>
      <div className="row" style={{ padding: 12, justifyContent: "space-between" }}>
        <span>{it.meta.name ?? it.kind} <span style={{ opacity: .7 }}>· {new Date(it.created_at).toLocaleString()}{it.meta.size ? ` · ${formatBytes(it.meta.size)}` : ""}</span></span>
        <span className="row">{url && <a className="btn ghost" style={{ background: "#ffffff22", color: "#fff" }} href={url} download={it.meta.name ?? true} target="_blank" rel="noopener noreferrer">⬇ Download</a>}<button className="btn ghost" style={{ background: "#ffffff22", color: "#fff" }} onClick={onClose} aria-label="Close viewer">✕</button></span>
      </div>
      <div style={{ position: "relative", display: "grid", placeItems: "center", minHeight: 0 }}>
        {!url ? <div className="skeleton" style={{ width: "60%", height: "60%" }} aria-busy /> : it.kind === "video" ? <video src={url} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "100%" }} /> : <img src={url} alt={it.meta.name ?? "Photo"} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
        {index > 0 && <button aria-label="Previous" className="btn ghost" onClick={() => setIndex(index - 1)} style={{ position: "absolute", left: 10, background: "#ffffff22", color: "#fff" }}>‹</button>}
        {index < items.length - 1 && <button aria-label="Next" className="btn ghost" onClick={() => setIndex(index + 1)} style={{ position: "absolute", right: 10, background: "#ffffff22", color: "#fff" }}>›</button>}
      </div>
    </div>);
}

function FileRow({ it }: { it: Item }) {
  const [busy, setBusy] = useState(false);
  const open = async () => { setBusy(true); const u = await signedUrl(it.media_path); setBusy(false); if (u) window.open(u, "_blank", "noopener"); };
  return (
    <li className="row" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ minWidth: 0 }}>{it.kind === "file" ? "📄" : "🎧"} <b style={{ wordBreak: "break-all" }}>{it.meta.name ?? it.body ?? "File"}</b><div className="muted" style={{ fontSize: ".8rem" }}>{it.meta.size ? formatBytes(it.meta.size) : ""} · {new Date(it.created_at).toLocaleDateString()}</div></span>
      <button className="btn ghost" onClick={open} disabled={busy}>{busy ? "…" : "⬇ Open"}</button>
    </li>);
}

/** Per-conversation gallery. RLS limits rows to conversations the caller belongs to; deleted messages never appear. */
export function MediaGallery({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [tab, setTab] = useState<GalleryTab>("photos"); const [items, setItems] = useState<Item[]>([]); const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true); const [q, setQ] = useState(""); const [view, setView] = useState<number | null>(null);
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null); const [err, setErr] = useState("");

  const fetchPage = useCallback(async (from: number, term: string, t: GalleryTab) => {
    let query = supabase().from("messages").select("id,sender_id,kind,media_path,body,meta,created_at").eq("conversation_id", conversationId).not("media_path", "is", null).is("deleted_at", null).in("kind", TAB_KINDS[t]).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    if (term) { const esc = term.replace(/[\\%_]/g, (c) => `\\${c}`); query = query.ilike("meta->>name", `%${esc}%`); }
    const { data, error } = await query; if (error) throw error; return (data ?? []) as Item[];
  }, [conversationId]);

  useEffect(() => { let live = true; setLoading(true); setErr(""); fetchPage(0, q.trim(), tab).then((d) => { if (live) { setItems(d); setMore(d.length === PAGE); } }).catch(() => live && setErr("Couldn't load media.")).finally(() => live && setLoading(false)); return () => { live = false; }; }, [tab, q, fetchPage]);
  useEffect(() => { api<{ usedBytes: number; quotaBytes: number }>("/api/storage", "GET").then((r) => !r.error && setUsage(r)); }, []);

  const visual = tab === "photos" || tab === "videos";
  const pct = usage ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100) : 0;
  return (
    <aside className="glass card" style={{ display: "grid", gap: 8, alignContent: "start", overflow: "auto", maxHeight: "100%" }} aria-label="Shared media">
      <div className="row" style={{ justifyContent: "space-between" }}><b>🖼️ Shared media</b><button className="btn ghost" onClick={onClose} aria-label="Close gallery">✕</button></div>
      <div className="row" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? "" : "ghost"}`} style={{ padding: ".3em .7em" }} onClick={() => setTab(k)}>{l}</button>)}</div>
      {!visual && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file names…" aria-label="Search files" />}
      {err && <p role="alert" className="chip" style={{ background: "#ffe3e3" }}>{err}</p>}
      {loading ? <div className="skeleton" style={{ height: 120 }} aria-busy /> : !items.length ? <p className="muted">{q ? "No files match." : `No ${tab} shared yet. Drag files into the chat to share them.`}</p> : visual ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))", gap: 6 }}>{items.map((it, i) => <Thumb key={it.id} it={it} onOpen={() => setView(i)} />)}</div>
      ) : <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{items.map((it) => <FileRow key={it.id} it={it} />)}</ul>}
      {more && !loading && <button className="btn ghost" onClick={async () => { try { const d = await fetchPage(items.length, q.trim(), tab); setItems((x) => [...x, ...d]); setMore(d.length === PAGE); } catch { setErr("Couldn't load more."); } }}>Load more</button>}
      {usage && <div title="Your total storage across all conversations"><div className="muted" style={{ fontSize: ".8rem" }}>Your storage: {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)}</div><div style={{ height: 5, borderRadius: 9, background: "var(--line)" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 9, background: pct > 90 ? "#d6336c" : "linear-gradient(90deg,var(--blue),var(--cyan))" }} /></div></div>}
      {view !== null && visual && <Viewer items={items} index={view} setIndex={setView} onClose={() => setView(null)} />}
    </aside>);
}
