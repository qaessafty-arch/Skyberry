"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { signedUrl, uploadValidated, useMe } from "@/lib/data";
import { Media } from "@/modules/social/Media";
import { KIND_LABEL, normalizeUrl, querySaved, type SavedKind, type SavedQuery, type SavedRow } from "@/modules/saved/filter";

interface Row extends SavedRow { message_id: string | null; message?: { body: string | null; deleted_at: string | null; conversation_id: string } | null }
interface Collection { id: string; name: string }
const KINDS = Object.keys(KIND_LABEL) as (SavedKind | "all")[];

/** Private archive. Everything here is visible only to its owner (RLS); pinning-for-everyone lives in the chat. */
export default function Saved() {
  const me = useMe();
  const [rows, setRows] = useState<Row[] | null>(null); const [cols, setCols] = useState<Collection[]>([]);
  const [q, setQ] = useState<SavedQuery>({ text: "", kind: "all", collection: "all", sort: "newest" });
  const [note, setNote] = useState(""); const [link, setLink] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: r }, { data: c }] = await Promise.all([
      sb.from("saved_items").select("*, message:messages(body,deleted_at,conversation_id)").order("created_at", { ascending: false }).limit(500),
      sb.from("saved_collections").select("id,name").order("name"),
    ]);
    setRows((r as unknown as Row[]) ?? []); setCols(c ?? []);
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 4000); return () => clearTimeout(t); }, [note]);

  const shown = useMemo(() => querySaved(rows ?? [], q), [rows, q]);
  const colName = (id: string | null) => cols.find((c) => c.id === id)?.name;

  async function addLink(e: React.FormEvent) {
    e.preventDefault(); const url = normalizeUrl(link); if (!url) return setNote("Enter a valid http(s) link.");
    const { error } = await supabase().from("saved_items").insert({ owner_id: me!.id, kind: "link", url, title: new URL(url).hostname, collection_id: q.collection !== "all" && q.collection !== "none" ? q.collection : null });
    setNote(error ? "Couldn't save link." : "Link saved"); setLink(""); load();
  }
  async function addFile(f: File) {
    setBusy(true);
    try {
      const { path, kind } = await uploadValidated(f);
      const k: SavedKind = kind === "image" ? "photo" : kind === "audio" ? "voice" : kind;
      const { error } = await supabase().from("saved_items").insert({ owner_id: me!.id, kind: k, media_path: path, title: f.name, collection_id: q.collection !== "all" && q.collection !== "none" ? q.collection : null });
      setNote(error ? "Couldn't save file." : "Saved");
    } catch (e) { setNote(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); load(); }
  }
  const patch = async (id: string, p: Record<string, unknown>) => { const { error } = await supabase().from("saved_items").update(p).eq("id", id); if (error) setNote("Couldn't update."); load(); };
  const remove = async (id: string) => { if (!confirm("Remove from Saved?")) return; await supabase().from("saved_items").delete().eq("id", id); load(); };
  async function newCollection() { const name = prompt("Collection name")?.trim(); if (!name) return; const { error } = await supabase().from("saved_collections").insert({ owner_id: me!.id, name: name.slice(0, 40) }); setNote(error ? "That name is taken." : "Collection created"); load(); }
  async function renameCollection(c: Collection) { const name = prompt("Rename collection", c.name)?.trim(); if (!name || name === c.name) return; const { error } = await supabase().from("saved_collections").update({ name: name.slice(0, 40) }).eq("id", c.id); setNote(error ? "That name is taken." : "Renamed"); load(); }
  async function deleteCollection(c: Collection) { if (!confirm(`Delete "${c.name}"? Items stay in Saved, just unfiled.`)) return; await supabase().from("saved_collections").delete().eq("id", c.id); if (q.collection === c.id) setQ({ ...q, collection: "all" }); load(); }
  async function download(path: string) { const u = await signedUrl(path); if (u) window.open(u, "_blank", "noopener"); else setNote("Couldn't open file."); }

  return (<>
    <h1>💾 Saved</h1>
    <p className="muted">Private to you. Messages you <b>pin</b> in a chat are shared with everyone there; things you <b>save</b> are only yours.</p>
    <div className="row" style={{ margin: "10px 0" }}>
      <input value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Search saved…" aria-label="Search saved" style={{ flex: 1, minWidth: 180 }} />
      <select aria-label="Sort" value={q.sort} onChange={(e) => setQ({ ...q, sort: e.target.value as SavedQuery["sort"] })} style={{ width: "auto" }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
    </div>
    <div className="row" role="tablist" aria-label="Filter by type">{KINDS.map((k) => <button key={k} role="tab" aria-selected={q.kind === k} className={`btn ${q.kind === k ? "" : "ghost"}`} style={{ padding: ".3em .8em" }} onClick={() => setQ({ ...q, kind: k })}>{KIND_LABEL[k]}</button>)}</div>
    <div className="row" style={{ margin: "10px 0" }} aria-label="Collections">
      <button className={`btn ${q.collection === "all" ? "" : "ghost"}`} style={{ padding: ".3em .8em" }} onClick={() => setQ({ ...q, collection: "all" })}>All items</button>
      <button className={`btn ${q.collection === "none" ? "" : "ghost"}`} style={{ padding: ".3em .8em" }} onClick={() => setQ({ ...q, collection: "none" })}>Unfiled</button>
      {cols.map((c) => <span key={c.id} className="row" style={{ gap: 2 }}>
        <button className={`btn ${q.collection === c.id ? "" : "ghost"}`} style={{ padding: ".3em .8em" }} onClick={() => setQ({ ...q, collection: c.id })}>📁 {c.name}</button>
        {q.collection === c.id && <><button className="btn ghost" style={{ padding: ".3em .6em" }} onClick={() => renameCollection(c)} aria-label={`Rename ${c.name}`}>✏️</button><button className="btn ghost" style={{ padding: ".3em .6em" }} onClick={() => deleteCollection(c)} aria-label={`Delete ${c.name}`}>🗑</button></>}</span>)}
      <button className="btn ghost" style={{ padding: ".3em .8em" }} onClick={newCollection}>＋ New folder</button>
    </div>
    <div className="glass card row" style={{ marginBottom: 12 }}>
      <form className="row" onSubmit={addLink} style={{ flex: 1 }}><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Save a link…" aria-label="Link to save" style={{ flex: 1 }} /><button className="btn ghost">Save link</button></form>
      <label className="btn ghost" style={{ cursor: busy ? "default" : "pointer" }}>{busy ? "Uploading…" : "📎 Save a file"}<input type="file" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addFile(f); }} /></label>
    </div>
    {note && <p role="status" className="chip">{note}</p>}

    {rows === null ? <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}</div> : (
      <div className="grid">
        {shown.map((r) => (
          <article key={r.id} className="glass card" style={{ display: "grid", gap: 8, alignContent: "start" }}>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="chip">{KIND_LABEL[r.kind]}</span><span className="muted" style={{ fontSize: ".8rem" }}>{new Date(r.created_at).toLocaleDateString()}</span></div>
            {r.media_path && (r.kind === "photo" || r.kind === "sticker") && <Media path={r.media_path} alt={r.title ?? "Saved photo"} />}
            {r.media_path && r.kind !== "photo" && r.kind !== "sticker" && <button className="btn ghost" onClick={() => download(r.media_path!)}>⬇ {r.title ?? "Open file"}</button>}
            {r.kind === "link" && r.url && <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: "underline", wordBreak: "break-all" }}>{r.url}</a>}
            {r.message_id && (r.message?.deleted_at ? <em className="muted">🚫 The original message was deleted</em> : <div>{r.message?.body ?? r.title ?? "Saved message"}{r.message?.conversation_id && <div><Link href={`/chats?c=${r.message.conversation_id}`} className="muted" style={{ textDecoration: "underline" }}>Open conversation</Link></div>}</div>)}
            {r.kind === "memory" && !r.media_path && <div>{r.title}</div>}
            {editing === r.id ? (
              <form className="row" onSubmit={(e) => { e.preventDefault(); patch(r.id, { note: draft.trim() || null }); setEditing(null); }}><input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} aria-label="Note" style={{ flex: 1 }} autoFocus /><button className="btn">Save</button></form>
            ) : <button className="btn ghost" style={{ textAlign: "left" }} onClick={() => { setEditing(r.id); setDraft(r.note ?? ""); }}>{r.note ? `📝 ${r.note}` : "＋ Add a note"}</button>}
            <div className="row">
              <select aria-label="Collection" value={r.collection_id ?? ""} onChange={(e) => patch(r.id, { collection_id: e.target.value || null })} style={{ width: "auto", flex: 1 }}><option value="">Unfiled</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <button className="btn ghost" onClick={() => remove(r.id)} aria-label="Remove from Saved">🗑</button>
            </div>
            {colName(r.collection_id) && q.collection === "all" && <span className="muted" style={{ fontSize: ".8rem" }}>📁 {colName(r.collection_id)}</span>}
          </article>))}
        {!shown.length && <p className="muted">{rows.length ? "Nothing matches your filters." : "Nothing saved yet. Use ⋯ → Save on any message, or add a link or file above."}</p>}
      </div>)}
  </>);
}
