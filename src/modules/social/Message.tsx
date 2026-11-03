"use client";
import { useEffect, useState } from "react";
import { signedUrl } from "@/lib/data";

export interface Msg { id: string; sender_id: string; kind: string; body: string | null; media_path: string | null; meta: Record<string, unknown>; created_at: string }
export interface Reaction { message_id: string; user_id: string; emoji: string }

export function MessageBody({ m, me, reactions, onVote }: { m: Msg; me: string; reactions: Reaction[]; onVote: (i: number) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (m.media_path) signedUrl(m.media_path).then(setUrl); }, [m.media_path]);
  if (m.kind === "image") return url ? <img src={url} alt={m.body ?? "Shared photo"} style={{ maxWidth: "100%", borderRadius: 14 }} /> : <span className="muted">Loading photo…</span>;
  if (m.kind === "sticker") return <span style={{ fontSize: "3rem" }} role="img" aria-label="sticker">{m.body}</span>;
  if (m.kind === "secret") return open ? <span>{m.body}</span> : <button className="btn ghost" onClick={() => setOpen(true)}>🔒 Tap to reveal</button>;
  if (m.kind === "surprise") return open ? <span style={{ fontSize: "1.6rem" }}>🎉 {String(m.meta.item ?? "A surprise!")}</span> : <button className="btn" onClick={() => setOpen(true)} aria-label="Open surprise gift">🎁 Tap to open</button>;
  if (m.kind === "poll" || m.kind === "game") {
    const opts = (m.meta.options as string[]) ?? [];
    const votes = reactions.filter((r) => r.message_id === m.id && r.emoji.startsWith("vote:"));
    return (<div><b>{String(m.meta.q ?? m.body)}</b>
      {opts.map((o, i) => { const n = votes.filter((v) => v.emoji === `vote:${i}`).length; const mine = votes.some((v) => v.user_id === me && v.emoji === `vote:${i}`);
        return <button key={i} className={`btn ${mine ? "" : "ghost"}`} style={{ display: "flex", width: "100%", justifyContent: "space-between", marginTop: 6 }} onClick={() => onVote(i)}><span>{o}</span><span>{n || ""}</span></button>; })}
    </div>);
  }
  return <span>{m.body}</span>;
}
