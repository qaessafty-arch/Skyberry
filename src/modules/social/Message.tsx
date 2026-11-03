"use client";
import { useEffect, useState } from "react";
import { signedUrl } from "@/lib/data";
import { formatBytes } from "@/lib/media/helpers";

export interface Msg { id: string; conversation_id?: string; sender_id: string; kind: string; body: string | null; media_path: string | null; meta: Record<string, unknown>; created_at: string; reply_to?: string | null; forwarded_from?: string | null; edited_at?: string | null; deleted_at?: string | null }
export interface Reaction { message_id: string; user_id: string; emoji: string }

export function MessageBody({ m, me, reactions, onVote }: { m: Msg; me: string; reactions: Reaction[]; onVote: (i: number) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (m.media_path && m.kind !== "file") signedUrl(m.media_path).then(setUrl); }, [m.media_path, m.kind]);
  if (m.deleted_at) return <em className="muted">🚫 This message was deleted</em>;
  if (m.kind === "image") return url ? <img src={url} alt={m.body ?? "Shared photo"} style={{ maxWidth: "100%", borderRadius: 14 }} /> : <span className="muted">Loading photo…</span>;
  if (m.kind === "video") return url ? <video src={url} controls preload="metadata" playsInline style={{ maxWidth: "100%", borderRadius: 14 }} /> : <span className="muted">Loading video…</span>;
  if (m.kind === "audio" || m.kind === "voice") return url ? <audio src={url} controls preload="metadata" style={{ maxWidth: "100%" }} /> : <span className="muted">Loading audio…</span>;
  if (m.kind === "file") { const meta = m.meta as { name?: string; size?: number }; return <button className="btn ghost" onClick={async () => { const u = url ?? (m.media_path ? await signedUrl(m.media_path) : null); if (u) window.open(u, "_blank", "noopener"); }} style={{ display: "flex", gap: 8, textAlign: "left" }}>📄 <span><b style={{ wordBreak: "break-all" }}>{meta.name ?? m.body ?? "File"}</b>{meta.size ? <span className="muted"> · {formatBytes(meta.size)}</span> : null}</span></button>; }
  if (m.kind === "gif") { const u = (m.meta as { url?: string }).url; return u ? <img src={u} alt="GIF" loading="lazy" referrerPolicy="no-referrer" style={{ maxWidth: "100%", borderRadius: 12 }} /> : null; }
  if (m.kind === "location") { const { lat, lng, label } = m.meta as { lat: number; lng: number; label?: string }; return <a className="btn ghost" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block" }}>📍 {label ?? "Shared location"}<div className="muted" style={{ fontSize: ".75rem" }}>{lat}, {lng} · opens OpenStreetMap</div></a>; }
  if (m.kind === "game" && (m.meta as { game?: string }).game === "tod-prompt") { const g = m.meta as { choice: string; prompt: string }; return <div><b>{g.choice === "Truth" ? "🫣 Truth" : "🔥 Dare"}</b><div>{g.prompt}</div></div>; }
  if (m.kind === "sticker" && m.media_path) return url ? <img src={url} alt={m.body ?? "Sticker"} style={{ width: 140, height: 140, objectFit: "contain" }} /> : <span className="muted">…</span>;
  if (m.kind === "sticker") return <span style={{ fontSize: "3rem" }} role="img" aria-label="sticker">{m.body}</span>;
  if (m.kind === "secret") return open ? <span>{m.body}</span> : <button className="btn ghost" onClick={() => setOpen(true)}>🔒 Tap to reveal</button>;
  if (m.kind === "surprise") return open ? <span style={{ fontSize: "1.6rem" }}>🎉 {String(m.meta.item ?? "A surprise!")}</span> : <button className="btn" onClick={() => setOpen(true)} aria-label="Open surprise gift">🎁 Tap to open</button>;
  if (m.kind === "poll" || m.kind === "game") {
    const opts = (m.meta.options as string[]) ?? [];
    const votes = reactions.filter((r) => r.message_id === m.id && r.emoji.startsWith("vote:"));
    return (<div><b>{String(m.meta.q ?? m.body)}</b>
      {opts.map((o, i) => { const n = votes.filter((v) => v.emoji === `vote:${i}`).length; const mine = votes.some((v) => v.user_id === me && v.emoji === `vote:${i}`);
        const trivia = (m.meta as { game?: string }).game === "trivia"; const answered = trivia && votes.some((v) => v.user_id === me); const right = answered && Number((m.meta as { answer?: number }).answer) === i;
        return <button key={i} className={`btn ${mine ? "" : "ghost"}`} onClick={() => onVote(i)} style={{ display: "flex", width: "100%", justifyContent: "space-between", marginTop: 6, ...(right ? { outline: "3px solid #2fbf71" } : {}) }}><span>{right ? "✅ " : ""}{o}</span><span>{n || ""}</span></button>; })}
    </div>);
  }
  return <span style={{ whiteSpace: "pre-wrap" }}>{linkify(m.body ?? "")}</span>;
}

/** Renders URLs as safe links; everything else stays plain text (React escapes it — no HTML injection). */
function linkify(t: string) {
  return t.split(/(https?:\/\/[^\s<]+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: "underline" }}>{part}</a> : part);
}
