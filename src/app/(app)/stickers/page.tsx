"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, signedUrl, useFriends, useMe } from "@/lib/data";
import { StickerMaker } from "@/modules/stickers/StickerMaker";
import { canDecideConsent } from "@/lib/stickers/logic";

interface Pack { id: string; name: string; owner_id: string; conversation_id: string | null }
interface St { id: string; pack_id: string; media_path: string; name: string | null; tags: string[]; consent: string; subject_id: string | null; owner_id: string }
const Thumb = ({ path }: { path: string }) => { const [u, setU] = useState<string | null>(null); useEffect(() => { signedUrl(path).then(setU); }, [path]); return u ? <img src={u} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "contain" }} /> : <div className="skeleton" style={{ aspectRatio: "1" }} />; };

export default function Stickers() {
  const me = useMe(); const { friends } = useFriends(me);
  const [packs, setPacks] = useState<Pack[]>([]); const [stickers, setStickers] = useState<St[]>([]); const [note, setNote] = useState("");
  const [rm, setRm] = useState<((c: HTMLCanvasElement) => Promise<void>) | undefined>();
  const load = useCallback(async () => { const sb = supabase(); const [{ data: p }, { data: s }] = await Promise.all([sb.from("sticker_packs").select("*"), sb.from("stickers").select("*").order("created_at", { ascending: false })]); setPacks((p as Pack[]) ?? []); setStickers((s as St[]) ?? []); }, []);
  useEffect(() => { if (me) load(); }, [me, load]);
  // optional background removal (loaded lazily; only offered if the model can load in this browser)
  useEffect(() => { import("@/modules/camera/segmentation").then((m) => m.segmentationAvailable().then((ok) => ok && setRm(() => m.cutoutCanvas))).catch(() => {}); }, []);

  const pending = stickers.filter((s) => canDecideConsent(s, me?.id ?? ""));
  const mine = packs.filter((p) => p.owner_id === me?.id); const shared = packs.filter((p) => p.owner_id !== me?.id);
  const decide = async (id: string, decision: "approved" | "declined") => { const r = await api("/api/stickers", "PATCH", { stickerId: id, decision }); setNote(r.error ? "Couldn't update." : decision === "approved" ? "Approved" : "Declined"); load(); };
  async function newPack() { const name = prompt("Pack name")?.trim(); if (!name) return; const r = await api("/api/stickers/packs", "POST", { name }); setNote(r.error ? "Couldn't create pack." : "Pack created"); load(); }
  async function share(p: Pack) {
    const acc = (friends ?? []).filter((f) => f.status === "accepted"); const pick = prompt(`Share "${p.name}" with:\n${acc.map((f, i) => `${i + 1}. ${f.other.display_name}`).join("\n")}\n\nEnter a number`); const f = acc[Number(pick) - 1]; if (!f) return;
    const r = await api("/api/stickers/packs", "PUT", { packId: p.id, userId: f.other.id }); setNote(r.error ? "Couldn't share." : `Shared with ${f.other.display_name}`);
  }
  async function del(id: string) { if (!confirm("Delete this sticker?")) return; await supabase().from("stickers").delete().eq("id", id); load(); }
  async function delPack(p: Pack) { if (!confirm(`Delete "${p.name}" and its stickers?`)) return; await supabase().from("sticker_packs").delete().eq("id", p.id); load(); }

  return (<>
    <h1>🖼️ Stickers</h1>
    {note && <p role="status" className="chip">{note}</p>}
    {pending.length > 0 && <div className="glass card" style={{ marginBottom: 12 }} role="region" aria-label="Sticker requests"><h3>Requests to use your face</h3><p className="muted">A friend made a sticker from a photo of you. It stays hidden from everyone else until you approve.</p>
      <div className="grid">{pending.map((s) => <div key={s.id} className="glass card"><Thumb path={s.media_path} /><div className="row" style={{ marginTop: 6 }}><button className="btn" onClick={() => decide(s.id, "approved")}>Approve</button><button className="btn ghost" onClick={() => decide(s.id, "declined")}>Decline</button></div></div>)}</div></div>}
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
      <StickerMaker onCreated={load} removeBackground={rm} />
      <div className="glass card"><div className="row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>Your packs</h3><button className="btn ghost" onClick={newPack}>＋ New pack</button></div>
        {mine.map((p) => <div key={p.id} style={{ marginTop: 10 }}><div className="row" style={{ justifyContent: "space-between" }}><b>{p.name}</b><span className="row"><button className="btn ghost" onClick={() => share(p)}>Share</button><button className="btn ghost" onClick={() => delPack(p)} aria-label={`Delete ${p.name}`}>🗑</button></span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(64px,1fr))", gap: 4 }}>{stickers.filter((s) => s.pack_id === p.id).map((s) => <div key={s.id} style={{ position: "relative", opacity: s.consent === "pending" ? 0.45 : 1 }} title={s.consent === "pending" ? "Waiting for approval" : s.consent === "declined" ? "Declined" : s.name ?? ""}><Thumb path={s.media_path} /><button onClick={() => del(s.id)} aria-label="Delete sticker" style={{ position: "absolute", top: 0, right: 0, border: 0, background: "none", cursor: "pointer" }}>✕</button>{s.consent !== "self" && s.consent !== "approved" && <span className="chip" style={{ position: "absolute", bottom: 0, fontSize: ".6rem" }}>{s.consent}</span>}</div>)}</div></div>)}
        {!mine.length && <p className="muted">Make your first sticker to start a pack.</p>}
        {shared.length > 0 && <><h3 style={{ marginTop: 16 }}>Shared with you</h3>{shared.map((p) => <div key={p.id}><b>{p.conversation_id ? "👥 " : ""}{p.name}</b> <span className="muted">· {stickers.filter((s) => s.pack_id === p.id).length} stickers</span></div>)}</>}
      </div>
    </div></>);
}
