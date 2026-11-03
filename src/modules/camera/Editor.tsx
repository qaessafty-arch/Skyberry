"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ASPECTS, type Aspect } from "./compose";
import { applyAdjust, commit, hist, isNeutral, NEUTRAL, redo, undo, qualityLabel, type Adjust, type History } from "./adjust";
import type { Shot } from "./CameraStudio";

type Stroke = { color: string; w: number; pts: [number, number][] };
type Txt = { t: string; x: number; y: number; color: string; size: number };
type Stk = { s: string; x: number; y: number };
export interface EditState {
  adj: Adjust; filter: string; aspect: Aspect | "free"; rotate: 0 | 90 | 180 | 270; zoom: number; panX: number; panY: number;
  strokes: Stroke[]; texts: Txt[]; stickers: Stk[]; blur: number;
}
const INIT: EditState = { adj: NEUTRAL, filter: "none", aspect: "free", rotate: 0, zoom: 1, panX: 0, panY: 0, strokes: [], texts: [], stickers: [], blur: 0 };
const FILTERS: Record<string, string> = { None: "none", Vintage: "sepia(0.45) contrast(1.1) saturate(0.9)", Neon: "saturate(1.8) contrast(1.15) hue-rotate(-15deg)", "Ocean": "hue-rotate(160deg) saturate(1.3) brightness(1.05)", Mono: "grayscale(1)", Warm: "sepia(0.25) saturate(1.2) brightness(1.05)", Cool: "hue-rotate(190deg) saturate(1.1)" };
const EMOJI = ["🐙", "🦈", "🐬", "🫧", "🌊", "⭐", "💙", "😎", "👑", "🎉"];
const SLIDERS: [keyof Adjust, string, number, number][] = [["brightness", "Brightness", -1, 1], ["contrast", "Contrast", -1, 1], ["saturation", "Saturation", -1, 1], ["highlights", "Highlights", -1, 1], ["shadows", "Shadows", -1, 1], ["sharpness", "Sharpness", 0, 1]];

/** Draws the full edit onto a canvas of the requested width. Used for both the live preview and the full-resolution export. */
export function renderEdit(img: ImageBitmap, st: EditState, outW: number, skipAdjust = false): HTMLCanvasElement {
  const rot = st.rotate % 180 !== 0; const sw = rot ? img.height : img.width, sh = rot ? img.width : img.height;
  const aspect = st.aspect === "free" ? sw / sh : ASPECTS[st.aspect];
  let cw = sw, ch = sw / aspect; if (ch > sh) { ch = sh; cw = sh * aspect; }
  cw /= st.zoom; ch /= st.zoom;
  const cx = Math.min(sw - cw, Math.max(0, (sw - cw) / 2 + st.panX * sw)), cy = Math.min(sh - ch, Math.max(0, (sh - ch) / 2 + st.panY * sh));
  // never upscale beyond the source crop
  const W = Math.min(outW, Math.round(cw)), H = Math.round(W / aspect);
  const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d")!;
  const tmp = document.createElement("canvas"); tmp.width = sw; tmp.height = sh; const t = tmp.getContext("2d")!;
  t.translate(sw / 2, sh / 2); t.rotate((st.rotate * Math.PI) / 180); t.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.filter = st.filter === "none" ? "none" : st.filter; ctx.drawImage(tmp, cx, cy, cw, ch, 0, 0, W, H); ctx.filter = "none";
  if (!skipAdjust && !isNeutral(st.adj)) { const id = ctx.getImageData(0, 0, W, H); const o = applyAdjust(id, st.adj); ctx.putImageData(new ImageData(o.data as unknown as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0); }
  for (const s of st.strokes) { ctx.strokeStyle = s.color; ctx.lineWidth = s.w * W; ctx.lineCap = ctx.lineJoin = "round"; ctx.beginPath(); s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H))); ctx.stroke(); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const x of st.texts) { ctx.font = `700 ${x.size * W}px system-ui, sans-serif`; ctx.fillStyle = x.color; ctx.shadowColor = "#0008"; ctx.shadowBlur = W * 0.01; ctx.fillText(x.t, x.x * W, x.y * H); ctx.shadowBlur = 0; }
  ctx.font = `${W / 8}px serif`; for (const s of st.stickers) ctx.fillText(s.s, s.x * W, s.y * H);
  return c;
}

export function Editor({ shot, onDone, onBack }: { shot: Shot; onDone: (s: Shot) => void; onBack: () => void }) {
  const view = useRef<HTMLCanvasElement>(null);
  const [h, setH] = useState<History<EditState>>(hist(INIT));
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [tool, setTool] = useState<"adjust" | "filters" | "crop" | "draw" | "text" | "stickers">("adjust");
  const [compare, setCompare] = useState(false);
  const [color, setColor] = useState("#ffffff"); const [pickEmoji, setPickEmoji] = useState(EMOJI[0]); const [txt, setTxt] = useState("");
  const drawing = useRef<Stroke | null>(null); const [note, setNote] = useState("");
  const st = h.present;
  const set = (patch: Partial<EditState>) => setH((x) => commit(x, { ...x.present, ...patch }));

  useEffect(() => { let live = true; createImageBitmap(shot.blob).then((b) => live && setImg(b)); return () => { live = false; }; }, [shot.blob]);
  // live preview at screen size
  useEffect(() => {
    if (!img || !view.current) return;
    const c = renderEdit(img, compare ? INIT : st, 900); const v = view.current; v.width = c.width; v.height = c.height; v.getContext("2d")!.drawImage(c, 0, 0);
  }, [img, st, compare, h]);

  const pos = (e: React.PointerEvent) => { const r = view.current!.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as [number, number]; };
  function down(e: React.PointerEvent) {
    const p = pos(e);
    if (tool === "draw") { drawing.current = { color, w: 0.008, pts: [p] }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }
    else if (tool === "text" && txt.trim()) { set({ texts: [...st.texts, { t: txt.trim(), x: p[0], y: p[1], color, size: 0.07 }] }); setTxt(""); }
    else if (tool === "stickers") set({ stickers: [...st.stickers, { s: pickEmoji, x: p[0], y: p[1] }] });
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !img || !view.current) return;
    drawing.current.pts.push(pos(e));
    const c = renderEdit(img, { ...st, strokes: [...st.strokes, drawing.current] }, 900); const v = view.current; v.getContext("2d")!.drawImage(c, 0, 0);
  }
  function up() { if (drawing.current && drawing.current.pts.length > 1) set({ strokes: [...st.strokes, drawing.current] }); drawing.current = null; }

  const exportShot = useCallback(async (): Promise<Shot> => {
    const full = renderEdit(img!, st, 4096); // capped by the source size inside renderEdit: no upscaling
    const blob = await new Promise<Blob>((r) => full.toBlob((b) => r(b!), "image/jpeg", 0.92));
    return { blob, url: URL.createObjectURL(blob), w: full.width, h: full.height };
  }, [img, st]);

  async function saveDevice() { const s = await exportShot(); const a = document.createElement("a"); a.href = s.url; a.download = `ocean-${Date.now()}.jpg`; a.click(); setNote(`Saved ${s.w}×${s.h} (${qualityLabel(s.w, s.h)})`); }
  async function saveDraft() {
    try {
      const db = await new Promise<IDBDatabase>((res, rej) => { const o = indexedDB.open("ocean", 1); o.onupgradeneeded = () => o.result.createObjectStore("drafts", { keyPath: "id" }); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
      await new Promise<void>((res, rej) => { const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put({ id: String(Date.now()), blob: shot.blob, state: st, at: Date.now() }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
      setNote("Draft saved on this device");
    } catch { setNote("Couldn't save draft"); }
  }

  if (!img) return <div className="glass card skeleton" style={{ height: 300 }} aria-busy />;
  const T = (k: typeof tool, l: string) => <button className={`btn ${tool === k ? "" : "ghost"}`} style={{ padding: ".4em .8em" }} onClick={() => setTool(k)} role="tab" aria-selected={tool === k}>{l}</button>;
  return (
    <div className="glass card" style={{ display: "grid", gap: 10, maxWidth: 620 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>Edit · {shot.w}×{shot.h} <span className="chip">{qualityLabel(shot.w, shot.h)}</span></b>
        <span className="row"><button className="btn ghost" onClick={() => setH(undo(h))} disabled={!h.past.length} aria-label="Undo">↶</button><button className="btn ghost" onClick={() => setH(redo(h))} disabled={!h.future.length} aria-label="Redo">↷</button>
          <button className="btn ghost" onClick={() => setH(commit(h, INIT))} disabled={JSON.stringify(st) === JSON.stringify(INIT)}>Reset</button>
          <button className="btn ghost" onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onKeyDown={(e) => e.key === " " && setCompare(true)} onKeyUp={() => setCompare(false)}>Hold: before</button></span>
      </div>
      <canvas ref={view} onPointerDown={down} onPointerMove={move} onPointerUp={up} style={{ width: "100%", borderRadius: 16, touchAction: tool === "draw" ? "none" : "auto", cursor: tool === "draw" ? "crosshair" : tool === "stickers" || tool === "text" ? "copy" : "default", background: "#0002" }} aria-label="Edit preview" />
      <div className="row" role="tablist">{T("adjust", "Adjust")}{T("filters", "Filters")}{T("crop", "Crop")}{T("draw", "Draw")}{T("text", "Text")}{T("stickers", "Stickers")}</div>
      {tool === "adjust" && <div style={{ display: "grid", gap: 4 }}>{SLIDERS.map(([k, l, lo, hi]) => <label key={k}>{l}<input type="range" min={lo} max={hi} step={0.05} value={st.adj[k]} onChange={(e) => set({ adj: { ...st.adj, [k]: +e.target.value } })} /></label>)}</div>}
      {tool === "filters" && <div className="row">{Object.entries(FILTERS).map(([n, f]) => <button key={n} className={`btn ${st.filter === f ? "" : "ghost"}`} onClick={() => set({ filter: f })}>{n}</button>)}</div>}
      {tool === "crop" && <div style={{ display: "grid", gap: 8 }}>
        <div className="row">{(["free", ...Object.keys(ASPECTS)] as (Aspect | "free")[]).map((a) => <button key={a} className={`btn ${st.aspect === a ? "" : "ghost"}`} onClick={() => set({ aspect: a })}>{a}</button>)}<button className="btn ghost" onClick={() => set({ rotate: ((st.rotate + 90) % 360) as EditState["rotate"] })}>⟳ Rotate</button></div>
        <label>Zoom<input type="range" min={1} max={4} step={0.05} value={st.zoom} onChange={(e) => set({ zoom: +e.target.value })} /></label>
        <label>Reposition ↔<input type="range" min={-0.5} max={0.5} step={0.01} value={st.panX} onChange={(e) => set({ panX: +e.target.value })} /></label>
        <label>Reposition ↕<input type="range" min={-0.5} max={0.5} step={0.01} value={st.panY} onChange={(e) => set({ panY: +e.target.value })} /></label></div>}
      {tool === "draw" && <div className="row"><span className="muted">Draw on the photo</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 50, padding: 2 }} aria-label="Pen colour" /></div>}
      {tool === "text" && <div className="row"><input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Type, then tap the photo" maxLength={60} style={{ flex: 1 }} aria-label="Text" /><input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 50, padding: 2 }} aria-label="Text colour" /></div>}
      {tool === "stickers" && <div className="row">{EMOJI.map((e) => <button key={e} className={`btn ${pickEmoji === e ? "" : "ghost"}`} onClick={() => setPickEmoji(e)} aria-pressed={pickEmoji === e}>{e}</button>)}<span className="muted">then tap the photo</span></div>}
      {note && <p role="status" className="chip">{note}</p>}
      <div className="row"><button className="btn ghost" onClick={onBack}>Retake</button><button className="btn ghost" onClick={saveDraft}>Save draft</button><button className="btn ghost" onClick={saveDevice}>Save to device</button><button className="btn" onClick={async () => onDone(await exportShot())}>Next →</button></div>
    </div>
  );
}
