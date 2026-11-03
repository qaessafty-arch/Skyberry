"use client";
import { useEffect, useState } from "react";
import { signedUrl, uploadValidated } from "@/lib/data";
import { DEFAULT_STYLE, styleVars, type ChatStyle } from "./chatStyle";
import { generateBackground, type ArtKind } from "./generateBackground";

/** Resolve a private background path to a short-lived URL for display. */
export function useBgUrl(style: ChatStyle) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; if (style.bg === "image" && style.bgPath) signedUrl(style.bgPath).then((u) => live && setUrl(u)); else setUrl(null); return () => { live = false; }; }, [style.bg, style.bgPath]);
  return url;
}

/** Live preview + controls. `onChange` fires continuously (preview); `onCommit` when a change should be persisted. */
export function ChatStyleEditor({ style, onChange, onCommit, title }: { style: ChatStyle; onChange: (s: ChatStyle) => void; onCommit: (s: ChatStyle) => void; title?: string }) {
  const bgUrl = useBgUrl(style); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const apply = (p: Partial<ChatStyle>, commit = true) => { const n = { ...style, ...p }; onChange(n); if (commit) onCommit(n); };
  async function upload(f: File) {
    setBusy(true); setNote("");
    try { const { path, kind } = await uploadValidated(f); if (kind !== "image") throw new Error("Choose an image file."); apply({ bg: "image", bgPath: path }); }
    catch (e) { setNote(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  }
  async function surprise(kind: ArtKind) {
    setBusy(true); setNote("");
    try { const blob = await generateBackground(kind, Math.floor(Math.random() * 1e9)); const { path } = await uploadValidated(new File([blob], `wallpaper-${Date.now()}.webp`, { type: "image/webp" })); apply({ bg: "image", bgPath: path }); }
    catch (e) { setNote(e instanceof Error ? e.message : "Couldn't create a wallpaper"); } finally { setBusy(false); }
  }
  const slider = (label: string, key: keyof ChatStyle, min: number, max: number, step = 1) => <label>{label}<input type="range" min={min} max={max} step={step} value={style[key] as number} onChange={(e) => onChange({ ...style, [key]: +e.target.value })} onPointerUp={() => onCommit(style)} onKeyUp={() => onCommit(style)} /></label>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {title && <b>{title}</b>}
      <div style={{ ...(styleVars(style, bgUrl) as React.CSSProperties), borderRadius: 16, padding: 12, display: "grid", gap: 6, border: "1px solid var(--line)", filter: style.bgBlur ? undefined : undefined }} aria-label="Live preview">
        <div className="bubble" style={{ borderRadius: "var(--bubble-radius)" }}>Hey! Preview of how chats will look 🌊</div>
        <div className="bubble me" style={{ borderRadius: "var(--bubble-radius)" }}>Looks great!</div>
      </div>
      <div className="row"><label>Bubbles <input type="color" value={style.bubble} onChange={(e) => apply({ bubble: e.target.value })} style={{ width: 50, padding: 2 }} /></label>
        <select aria-label="Background" value={style.bg} onChange={(e) => apply({ bg: e.target.value as ChatStyle["bg"] })} style={{ width: "auto" }}><option value="none">Default</option><option value="ocean">Ocean</option><option value="deep">Deep sea</option><option value="sunset">Sunset</option><option value="mint">Mint</option><option value="custom">Custom colour</option><option value="image" disabled={!style.bgPath}>My image</option></select>
        {style.bg === "custom" && <input type="color" aria-label="Background colour" value={style.bgColor} onChange={(e) => apply({ bgColor: e.target.value })} style={{ width: 50, padding: 2 }} />}
        <select aria-label="Font" value={style.family} onChange={(e) => apply({ family: e.target.value as ChatStyle["family"] })} style={{ width: "auto" }}><option value="system">System</option><option value="rounded">Rounded</option><option value="serif">Serif</option><option value="mono">Mono</option></select></div>
      <div className="row"><label className="btn ghost" style={{ cursor: busy ? "default" : "pointer" }}>🖼️ Upload a background<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} /></label>
        {(["waves", "bubbles", "aurora"] as ArtKind[]).map((k) => <button key={k} className="btn ghost" disabled={busy} onClick={() => surprise(k)}>🎲 {k}</button>)}{busy && <span className="muted">Working…</span>}</div>
      {style.bg === "image" && <>{slider("Background dimming", "bgDim", 0, 0.8, 0.05)}</>}
      {slider(`Text size ${style.font}px`, "font", 12, 22)}{slider("Bubble roundness", "radius", 4, 28)}{slider("Message spacing", "gap", 2, 20)}
      {note && <p role="alert" className="chip" style={{ background: "#ffe3e3", whiteSpace: "normal" }}>{note}</p>}
      <div className="row"><button className="btn ghost" onClick={() => apply({ ...DEFAULT_STYLE })}>Reset</button><span className="muted">Wallpapers are drawn on your device (not AI-generated) and stored privately.</span></div>
    </div>);
}
