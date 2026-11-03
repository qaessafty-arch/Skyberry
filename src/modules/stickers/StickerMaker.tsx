"use client";
import { useEffect, useRef, useState } from "react";
import { api, uploadValidated, useFriends, useMe } from "@/lib/data";
import { normalizeTags } from "@/lib/stickers/logic";
import { makeSticker, type StickerShape } from "./makeSticker";

/** Turn a photo into a sticker. If it shows another person, they must approve before anyone can use it. */
export function StickerMaker({ packId, onCreated, removeBackground }: { packId?: string; onCreated: () => void; removeBackground?: (c: HTMLCanvasElement) => Promise<void> }) {
  const me = useMe(); const { friends } = useFriends(me);
  const [file, setFile] = useState<File | null>(null); const [shape, setShape] = useState<StickerShape>("rounded"); const [outline, setOutline] = useState(true);
  const [cutout, setCutout] = useState(false); const [name, setName] = useState(""); const [tags, setTags] = useState(""); const [who, setWho] = useState("me");
  const [preview, setPreview] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const gen = useRef(0);

  useEffect(() => {
    if (!file) return setPreview(null); const g = ++gen.current;
    makeSticker(file, { shape, outline, size: 256, mask: cutout && removeBackground ? undefined : undefined }).then(async (b) => { if (g === gen.current) setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); }); }).catch(() => setNote("Couldn't read that image."));
  }, [file, shape, outline, cutout, removeBackground]);

  async function create() {
    if (!file) return; setBusy(true); setNote("");
    try {
      let blob = await makeSticker(file, { shape, outline });
      if (cutout && removeBackground) { const bmp = await createImageBitmap(blob); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d")!.drawImage(bmp, 0, 0); await removeBackground(c); blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/webp", 0.9)); }
      const up = await uploadValidated(new File([blob], `sticker-${Date.now()}.webp`, { type: "image/webp" }));
      const r = await api<{ needsConsent?: boolean }>("/api/stickers", "POST", { packId, mediaPath: up.path, name: name || undefined, tags: normalizeTags(tags), subjectId: who === "me" ? undefined : who });
      if (r.error) throw new Error("Couldn't create the sticker.");
      setNote(r.needsConsent ? "Created — it stays private until your friend approves it." : "Sticker created ✨"); setFile(null); setName(""); setTags(""); onCreated();
    } catch (e) { setNote(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }
  const accepted = friends?.filter((f) => f.status === "accepted") ?? [];
  return (
    <div className="glass card" style={{ display: "grid", gap: 8 }}>
      <b>Make a sticker</b>
      <label className="btn ghost" style={{ cursor: "pointer", width: "fit-content" }}>🖼️ Choose a photo<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      {preview && <div style={{ background: "repeating-conic-gradient(#0001 0 25%,transparent 0 50%) 0 0/16px 16px", borderRadius: 14, width: 160, height: 160 }}><img src={preview} alt="Sticker preview" width={160} height={160} /></div>}
      <div className="row">
        <select aria-label="Shape" value={shape} onChange={(e) => setShape(e.target.value as StickerShape)} style={{ width: "auto" }}><option value="rounded">Rounded</option><option value="circle">Circle</option><option value="square">Square</option></select>
        <label className="chip"><input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} style={{ width: "auto" }} />White outline</label>
        {removeBackground && <label className="chip"><input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} style={{ width: "auto" }} />Remove background</label>}
      </div>
      <input placeholder="Name (optional)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Sticker name" />
      <input placeholder="Search tags: funny, cat…" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" />
      <label>Who's in this photo?
        <select value={who} onChange={(e) => setWho(e.target.value)}><option value="me">Me / no one</option>{accepted.map((f) => <option key={f.other.id} value={f.other.id}>{f.other.display_name} (asks their permission)</option>)}</select></label>
      {who !== "me" && <p className="muted">They'll get a request. Until they approve, the sticker is invisible to everyone but you and them.</p>}
      <div className="row"><button className="btn" disabled={!file || busy} onClick={create}>{busy ? "Creating…" : "Create sticker"}</button>{note && <span role="status">{note}</span>}</div>
    </div>
  );
}
