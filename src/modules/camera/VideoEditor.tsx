"use client";
import { useEffect, useRef, useState } from "react";
import { pickVideoMime, readDuration, videoLabel, type Recorded } from "./recorder";

const FILTERS: Record<string, string> = { None: "none", Vintage: "sepia(0.45) contrast(1.1) saturate(0.9)", Neon: "saturate(1.8) contrast(1.15) hue-rotate(-15deg)", Ocean: "hue-rotate(160deg) saturate(1.3) brightness(1.05)", Mono: "grayscale(1)", Warm: "sepia(0.25) saturate(1.2) brightness(1.05)" };
export interface EditedVideo extends Recorded { cover: Blob | null }

/**
 * Trim, cover frame, volume/mute and filter. Export re-records the trimmed range in real time (so a 10 s clip takes ~10 s):
 * that's the only way to re-encode in a browser without shipping a WASM encoder.
 */
export function VideoEditor({ clip, onDone, onBack }: { clip: Recorded; onDone: (v: EditedVideo) => void; onBack: () => void }) {
  const vid = useRef<HTMLVideoElement>(null); const [dur, setDur] = useState(0); const [start, setStart] = useState(0); const [end, setEnd] = useState(0);
  const [cover, setCover] = useState(0); const [volume, setVolume] = useState(1); const [filter, setFilter] = useState("none"); const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0); const [err, setErr] = useState("");
  const abort = useRef(false);

  useEffect(() => { const v = vid.current!; let live = true; (async () => { // MediaRecorder files often lack a duration; if seeking can't recover it quickly, fall back to the time we measured while recording.
      const measured = await Promise.race([readDuration(v), new Promise<number>((r) => setTimeout(() => r(0), 1200))]); const d = measured > 0 && Number.isFinite(measured) ? measured : clip.durationMs / 1000;
      if (!live) return; setDur(d); setEnd((e) => (e === 0 ? d : e)); /* never clobber a trim the user already made */ })(); return () => { live = false; }; }, [clip.url, clip.durationMs]);
  useEffect(() => { const v = vid.current; if (!v) return; v.volume = Math.min(1, volume); v.style.filter = filter; }, [volume, filter]);
  // loop within the trimmed range while previewing
  useEffect(() => { const v = vid.current; if (!v || busy) return; /* not while exporting: it would rewind the recording */ const h = () => { if (v.currentTime >= end - 0.05) v.currentTime = start; }; v.addEventListener("timeupdate", h); return () => v.removeEventListener("timeupdate", h); }, [start, end, busy]);

  const seek = (t: number) => { const v = vid.current; if (v) { v.pause(); v.currentTime = t; } };

  async function frameAt(t: number): Promise<Blob | null> {
    const v = vid.current!; v.pause(); await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = t; });
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; const x = c.getContext("2d")!; x.filter = filter; x.drawImage(v, 0, 0);
    return new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  }

  async function exportVideo() {
    const v = vid.current!; setBusy(true); setErr(""); setPct(0); abort.current = false;
    const fmt = pickVideoMime((t) => MediaRecorder.isTypeSupported(t)); if (!fmt) { setErr("This browser can't re-encode video."); return setBusy(false); }
    const untouched = start <= 0.05 && end >= dur - 0.05 && volume === 1 && filter === "none";
    const coverBlob = await frameAt(Math.min(Math.max(cover, start), end));
    if (untouched) { setBusy(false); return onDone({ ...clip, cover: coverBlob }); }
    try {
      const W = v.videoWidth, H = v.videoHeight; const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d")!;
      const ac = new AudioContext(); const src = ac.createMediaElementSource(v); const gain = ac.createGain(); gain.gain.value = volume; const dest = ac.createMediaStreamDestination(); src.connect(gain).connect(dest); // routed to the recorder only → silent while exporting
      const out = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const rec = new MediaRecorder(out, { mimeType: fmt.mime, videoBitsPerSecond: Math.min(25_000_000, W * H * 30 * 0.1) }); const chunks: Blob[] = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const finished = new Promise<void>((r) => (rec.onstop = () => r()));
      v.pause(); await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = start; }); v.loop = false; v.muted = false;
      rec.start(500); const t0 = performance.now(); await v.play();
      await new Promise<void>((resolve) => {
        const tick = () => { if (abort.current || v.currentTime >= end || v.ended) return resolve(); x.filter = filter; x.drawImage(v, 0, 0, W, H); setPct(Math.min(99, Math.round(((v.currentTime - start) / Math.max(0.1, end - start)) * 100))); requestAnimationFrame(tick); };
        tick();
      });
      v.pause(); rec.stop(); await finished; await ac.close();
      if (abort.current) throw new Error("canceled");
      const blob = new Blob(chunks, { type: fmt.mime.split(";")[0] });
      onDone({ blob, url: URL.createObjectURL(blob), durationMs: performance.now() - t0, width: W, height: H, mime: blob.type, label: videoLabel(W, H), cover: coverBlob });
    } catch (e) { if ((e as Error).message !== "canceled") setErr("Export failed. Try without changes, or retake."); } finally { setBusy(false); }
  }
  async function saveDevice() { const a = document.createElement("a"); a.href = clip.url; a.download = `ocean-${Date.now()}.${clip.mime.includes("mp4") ? "mp4" : "webm"}`; a.click(); }

  const f = (n: number) => `${n.toFixed(1)}s`;
  return (
    <div className="glass card" style={{ display: "grid", gap: 10, maxWidth: 620 }}>
      <b>Edit video · {clip.width}×{clip.height} <span className="chip">{clip.label}</span> · {f(dur)}</b>
      <video ref={vid} src={clip.url} playsInline controls style={{ width: "100%", borderRadius: 16, background: "#000" }} data-testid="edit-video" />
      <label>Trim start {f(start)}<input type="range" min={0} max={Math.max(0.1, dur)} step={0.1} value={start} onChange={(e) => { const s = Math.min(+e.target.value, end - 0.5); setStart(s); seek(s); }} aria-label="Trim start" /></label>
      <label>Trim end {f(end)}<input type="range" min={0} max={Math.max(0.1, dur)} step={0.1} value={end} onChange={(e) => { const s = Math.max(+e.target.value, start + 0.5); setEnd(s); seek(s); }} aria-label="Trim end" /></label>
      <label>Cover frame {f(cover)}<input type="range" min={0} max={Math.max(0.1, dur)} step={0.1} value={cover} onChange={(e) => { setCover(+e.target.value); seek(+e.target.value); }} aria-label="Cover frame" /></label>
      <label>Volume {Math.round(volume * 100)}%<input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(+e.target.value)} aria-label="Volume" /></label>
      <div className="row">{Object.entries(FILTERS).map(([n, v]) => <button key={n} className={`btn ${filter === v ? "" : "ghost"}`} style={{ padding: ".3em .8em" }} onClick={() => setFilter(v)}>{n}</button>)}</div>
      {busy && <div role="status" className="chip">Exporting… {pct}% <button className="btn ghost" style={{ padding: ".05em .6em" }} onClick={() => (abort.current = true)}>Cancel</button></div>}
      {err && <p role="alert" className="chip" style={{ background: "#ffe3e3", whiteSpace: "normal" }}>{err}</p>}
      <div className="row"><button className="btn ghost" onClick={onBack} disabled={busy}>Retake</button><button className="btn ghost" onClick={saveDevice} disabled={busy}>Save original</button><button className="btn" onClick={exportVideo} disabled={busy || !dur} data-testid="video-next">Next →</button></div>
    </div>);
}
