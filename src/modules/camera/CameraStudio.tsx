"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ASPECTS, cropFor, guidance, groupFraming, goldenLines, thirdLines, type Aspect, type FaceBox } from "./compose";
import { warpImage } from "./warp";
import { Editor } from "./Editor";
import { VideoEditor, type EditedVideo } from "./VideoEditor";
import { Fx, NO_FX, detectFace, fxActive, type ArMask, type Background, type Funny, type FxOptions } from "./fx";
import { modelsPresent } from "./vision";
import { recordingPlan, startRecorder, type RecorderHandle, type Recorded } from "./recorder";
import { supabase } from "@/lib/supabase/browser";
import { signedUrl } from "@/lib/data";
import { qualityLabel } from "./adjust";

export type CameraMode = "quick" | "selfie" | "funny" | "portrait" | "cinematic" | "daily" | "group" | "handsfree" | "360";
const MODES: Record<CameraMode, { label: string; aspect: Aspect; facing: "user" | "environment"; filter: string; warp: number; timer: number; grid: Grid }> = {
  quick: { label: "Quick", aspect: "3:4", facing: "environment", filter: "none", warp: 0, timer: 0, grid: "off" },
  selfie: { label: "Selfie", aspect: "3:4", facing: "user", filter: "brightness(1.05) saturate(1.1)", warp: 0, timer: 0, grid: "thirds" },
  funny: { label: "Funny", aspect: "1:1", facing: "user", filter: "saturate(1.4)", warp: 0.7, timer: 0, grid: "off" },
  portrait: { label: "Portrait", aspect: "4:5", facing: "user", filter: "contrast(1.05) saturate(1.1) blur(0px)", warp: 0, timer: 0, grid: "thirds" },
  cinematic: { label: "Cinematic", aspect: "21:9", facing: "environment", filter: "contrast(1.2) saturate(0.85) sepia(0.15)", warp: 0, timer: 0, grid: "golden" },
  daily: { label: "Daily Life", aspect: "4:5", facing: "environment", filter: "sepia(0.18) saturate(1.15) brightness(1.04)", warp: 0, timer: 0, grid: "off" },
  group: { label: "Group", aspect: "16:9", facing: "user", filter: "none", warp: 0, timer: 5, grid: "thirds" },
  handsfree: { label: "Hands-free", aspect: "3:4", facing: "user", filter: "none", warp: 0, timer: 5, grid: "off" },
  "360": { label: "360°", aspect: "16:9", facing: "environment", filter: "none", warp: 0, timer: 0, grid: "off" },
};
type Grid = "off" | "thirds" | "golden";
const STICKERS = ["🐙", "🦈", "🐬", "🐢", "🫧", "🌊", "⭐", "💙", "😎", "👑"];
type Placed = { s: string; x: number; y: number };
export interface Shot { blob: Blob; url: string; w: number; h: number }

interface FaceDetectorLike { detect(v: CanvasImageSource): Promise<{ boundingBox: FaceBox }[]> }
declare global { interface Window { FaceDetector?: new (o?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike } }

/**
 * Capture studio. Uses real device capabilities where present (zoom/torch/exposure via MediaStream constraints,
 * FaceDetector for composition help) and degrades to digital equivalents otherwise.
 */
export function CameraStudio({ onDone, onDoneVideo, reducedMotion }: { onDone: (shot: Shot) => void; onDoneVideo?: (v: EditedVideo) => void; reducedMotion?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<CameraMode>("quick");
  const m = MODES[mode];
  const [aspect, setAspect] = useState<Aspect>(m.aspect);
  const [grid, setGrid] = useState<Grid>(m.grid);
  const [timer, setTimer] = useState(m.timer);
  const [facing, setFacing] = useState(m.facing);
  const [zoom, setZoom] = useState(1);
  const [exposure, setExposure] = useState(0);
  const [intensity, setIntensity] = useState(1);
  const [flash, setFlash] = useState(false);
  const [err, setErr] = useState(""); const [count, setCount] = useState(0);
  const [tip, setTip] = useState(""); const [tilt, setTilt] = useState<number | null>(null);
  const [res, setRes] = useState(""); const [caps, setCaps] = useState<{ zoom?: [number, number]; torch?: boolean; exposure?: [number, number] }>({});
  const [autoFrame, setAutoFrame] = useState(false);
  const [layout, setLayout] = useState<"bottom" | "right">("bottom");
  const [stickers, setStickers] = useState<Placed[]>([]); const [pick, setPick] = useState<string | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [clip, setClip] = useState<Recorded | null>(null); const editing = !!shot || !!clip;
  const [fxOpts, setFxOpts] = useState<FxOptions>(NO_FX); const fxRef = useRef(new Fx()); const fxOptsRef = useRef(fxOpts); fxOptsRef.current = fxOpts;
  const [fxModels, setFxModels] = useState(false); const [fxReady, setFxReady] = useState(false); const [swapList, setSwapList] = useState<{ id: string; media_path: string; name: string | null }[]>([]); const [swapNote, setSwapNote] = useState(""); const [swapId, setSwapId] = useState("");
  const [kind, setKind] = useState<"photo" | "video">("photo"); const [recording, setRecording] = useState(false); const [recMs, setRecMs] = useState(0);
  const recorder = useRef<RecorderHandle | null>(null); const recCanvas = useRef<HTMLCanvasElement | null>(null); const recLoop = useRef(0); const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceFocus = useRef<{ x: number; y: number } | undefined>(undefined);
  const flashOn = useRef(false); const [screenFlash, setScreenFlash] = useState(false);

  useEffect(() => { const x = MODES[mode]; setAspect(x.aspect); setGrid(x.grid); setTimer(x.timer); setFacing(x.facing); }, [mode]);

  // ── start stream (as high as the device allows, up to 4K) ──
  useEffect(() => {
    if (mode === "360" || editing) return; // the camera is released while editing, and re-acquired on return
    let dead = false;
    (async () => {
      try {
        stream.current?.getTracks().forEach((t) => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
        if (dead) return s.getTracks().forEach((t) => t.stop());
        stream.current = s; if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        const t = s.getVideoTracks()[0]; const st = t.getSettings(); setRes(`${st.width}×${st.height}`);
        const c = (t.getCapabilities?.() ?? {}) as Record<string, { min: number; max: number } | boolean[]>;
        setCaps({ zoom: c.zoom && "max" in c.zoom ? [c.zoom.min, c.zoom.max] : undefined, torch: !!(c as { torch?: boolean }).torch, exposure: c.exposureCompensation && "max" in c.exposureCompensation ? [c.exposureCompensation.min, c.exposureCompensation.max] : undefined });
        setErr("");
      } catch { setErr("Camera unavailable. Check permissions, or use Upload instead."); }
    })();
    return () => { dead = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [facing, mode, editing]);

  // MediaPipe effects (optional model files; see scripts/setup-vision.mjs)
  useEffect(() => { modelsPresent().then(setFxModels); }, []);
  useEffect(() => { if (fxModels && fxActive(fxOpts) && !fxReady) fxRef.current.init(fxOpts.mask !== "none" || fxOpts.funny !== "off" || !!fxOpts.swap, fxOpts.background !== "none").then(setFxReady); }, [fxModels, fxOpts, fxReady]);
  useEffect(() => { if (mode === "funny" && fxModels) setFxOpts((o) => (o.funny === "off" ? { ...o, funny: "bighead" } : o)); }, [mode, fxModels]);
  // Face swap may ONLY use faces that were explicitly approved (own photos, or friends' stickers they approved — enforced by RLS).
  useEffect(() => { supabase().from("stickers").select("id,media_path,name,subject_id,consent").in("consent", ["self", "approved"]).limit(40).then(({ data }) => setSwapList((data ?? []).map((x) => ({ id: x.id, media_path: x.media_path, name: x.name })))); }, []);
  async function chooseSwap(id: string) {
    setSwapNote(""); setSwapId(id); if (!id) return setFxOpts((o) => ({ ...o, swap: null }));
    const st = swapList.find((x) => x.id === id); if (!st) return; const url = await signedUrl(st.media_path); if (!url) return setSwapNote("Couldn't load that photo.");
    const bmp = await createImageBitmap(await (await fetch(url)).blob()); const f = await detectFace(bmp);
    if (!f) return setSwapNote("No face found in that photo."); setFxOpts((o) => ({ ...o, swap: { bitmap: bmp, frame: f.frame, oval: f.oval } }));
  }

  // hardware zoom / exposure / torch where supported
  const apply = useCallback(async (c: Record<string, unknown>) => { try { await stream.current?.getVideoTracks()[0].applyConstraints({ advanced: [c as MediaTrackConstraintSet] }); return true; } catch { return false; } }, []);
  useEffect(() => { if (caps.zoom) apply({ zoom }); }, [zoom, caps.zoom, apply]);
  useEffect(() => { if (caps.exposure) apply({ exposureCompensation: exposure }); }, [exposure, caps.exposure, apply]);
  useEffect(() => { if (caps.torch) apply({ torch: flash }); flashOn.current = flash; }, [flash, caps.torch, apply]);

  // horizon level from device orientation
  useEffect(() => {
    const h = (e: DeviceOrientationEvent) => { if (e.gamma !== null) setTilt(Math.round(e.gamma)); };
    window.addEventListener("deviceorientation", h); return () => window.removeEventListener("deviceorientation", h);
  }, []);

  // composition assistant: FaceDetector (Chromium) if present
  useEffect(() => {
    if (!window.FaceDetector || (mode !== "portrait" && mode !== "group" && mode !== "selfie" && !autoFrame)) { setTip(""); return; }
    const det = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 8 }); let stop = false;
    const loop = async () => {
      const v = video.current; if (stop) return;
      if (v && v.videoWidth) { try {
        const faces = (await det.detect(v)).map((f) => f.boundingBox); const frame = { w: v.videoWidth, h: v.videoHeight };
        if (mode === "group") { const g = groupFraming(faces, frame); setTip(g.advice); faceFocus.current = g.focus; }
        else { setTip(guidance(faces[0] ?? null, frame)); faceFocus.current = faces[0] && { x: (faces[0].x + faces[0].width / 2) / frame.w, y: (faces[0].y + faces[0].height / 2) / frame.h }; }
      } catch { /* detector failed this frame */ } }
      setTimeout(loop, 250);
    };
    loop(); return () => { stop = true; };
  }, [mode, autoFrame]);

  // One renderer for preview, photo capture and video recording: crop → filter → (legacy warp) → MediaPipe effects.
  const renderFrame = useCallback((c: HTMLCanvasElement, W: number, tms: number) => {
    const v = video.current; if (!v || !v.videoWidth) return false;
    const fo = fxOptsRef.current; const useFx = fxModels && fxReady && fxActive(fo); const a = ASPECTS[aspect];
    c.width = W; c.height = Math.round(W / a); const ctx = c.getContext("2d")!;
    const crop = cropFor(v.videoWidth, v.videoHeight, a, autoFrame ? faceFocus.current : undefined, caps.zoom ? 1 : zoom);
    ctx.save(); if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.filter = filterString(m.filter, intensity, exposure, !caps.exposure); ctx.drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height); ctx.restore(); ctx.filter = "none";
    if (useFx) { fxRef.current.update(c, fo, tms); fxRef.current.apply(c, fo, tms); }
    else if (m.warp) { const id = ctx.getImageData(0, 0, c.width, c.height); const f = faceFocus.current ?? { x: 0.5, y: 0.45 }; ctx.putImageData(new ImageData(warpImage(id, f.x * c.width, f.y * c.height, c.width * 0.32, m.warp * intensity).data as unknown as Uint8ClampedArray<ArrayBuffer>, c.width, c.height), 0, 0); }
    return true;
  }, [aspect, facing, m, intensity, exposure, zoom, caps, autoFrame, fxModels, fxReady]);

  // live preview
  useEffect(() => {
    let raf = 0; let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw); const c = preview.current; if (!c) return;
      const heavy = fxActive(fxOptsRef.current) || m.warp; if (t - last < (heavy ? 50 : 33)) return; last = t;
      renderFrame(c, heavy ? 480 : 720, t);
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [renderFrame, m]);

  const capture = useCallback(async () => {
    const v = video.current; if (!v?.videoWidth) return;
    if (timer) { for (let i = timer; i > 0; i--) { setCount(i); await new Promise((r) => setTimeout(r, 1000)); } setCount(0); }
    if (flashOn.current && !caps.torch) { setScreenFlash(true); await new Promise((r) => setTimeout(r, 180)); }
    const a = ASPECTS[aspect]; const crop = cropFor(v.videoWidth, v.videoHeight, a, autoFrame ? faceFocus.current : undefined, caps.zoom ? 1 : zoom);
    const effects = fxModels && fxReady && fxActive(fxOptsRef.current);
    const maxW = Math.min(effects || m.warp ? 1280 : 3840, Math.round(crop.w)); // never upscale: capped by the real crop; effect frames also capped for speed
    const c = document.createElement("canvas");
    if (effects) { // make sure detection has run on THIS frame before the final render
      renderFrame(c, maxW, performance.now()); await fxRef.current.update(c, fxOptsRef.current, performance.now() + 500, true);
    }
    renderFrame(c, maxW, performance.now() + 600);
    setScreenFlash(false);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.92));
    setShot({ blob, url: URL.createObjectURL(blob), w: c.width, h: c.height });
  }, [timer, caps, aspect, autoFrame, zoom, m, renderFrame, fxModels, fxReady]);

  // ── video recording ──
  async function startRecording() {
    const v = video.current; if (!v?.videoWidth || !stream.current) return;
    let mic: MediaStream | null = null;
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { /* record silent video */ }
    const effects = fxModels && fxReady && fxActive(fxOptsRef.current);
    const plan = recordingPlan({ effects: !!effects || m.warp > 0, aspectMatchesSensor: Math.abs(ASPECTS[aspect] - v.videoWidth / v.videoHeight) < 0.02 && !autoFrame && zoom === 1 && facing !== "user" && m.filter === "none", sensor: { w: v.videoWidth, h: v.videoHeight }, aspect: ASPECTS[aspect], zoom: caps.zoom ? 1 : zoom });
    let out: MediaStream;
    if (plan.source === "stream") out = new MediaStream([...stream.current.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])]);
    else {
      const c = (recCanvas.current = document.createElement("canvas")); const loop = (t: number) => { recLoop.current = requestAnimationFrame(loop); renderFrame(c, plan.width, t); }; recLoop.current = requestAnimationFrame(loop);
      out = new MediaStream([...c.captureStream(plan.fps).getVideoTracks(), ...(mic?.getAudioTracks() ?? [])]);
    }
    const h = startRecorder(out, plan, 60_000, () => finishRecording()); if (!h) { setErr("Video recording isn't supported in this browser."); cancelAnimationFrame(recLoop.current); mic?.getTracks().forEach((t) => t.stop()); return; }
    recorder.current = h; setRecording(true); setRecMs(0); const t0 = Date.now(); recTimer.current = setInterval(() => setRecMs(Date.now() - t0), 200);
    (recorder.current as RecorderHandle & { mic?: MediaStream | null }).mic = mic;
  }
  async function finishRecording() {
    const h = recorder.current as (RecorderHandle & { mic?: MediaStream | null }) | null; if (!h) return; recorder.current = null; if (recTimer.current) clearInterval(recTimer.current);
    cancelAnimationFrame(recLoop.current); setRecording(false);
    try { const r = await h.stop(); h.mic?.getTracks().forEach((t) => t.stop()); setClip(r); } catch { h.mic?.getTracks().forEach((t) => t.stop()); }
  }
  useEffect(() => () => { recorder.current?.cancel(); cancelAnimationFrame(recLoop.current); if (recTimer.current) clearInterval(recTimer.current); }, []);

  // hands-free: capture when the user says "cheese" if speech recognition exists; otherwise a timer does the job
  useEffect(() => {
    if (mode !== "handsfree") return;
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => { start(): void; stop(): void; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void } }).webkitSpeechRecognition;
    if (!SR) return; const r = new SR(); r.continuous = true;
    r.onresult = (e) => { const last = Array.from(e.results).at(-1)?.[0]?.transcript.toLowerCase() ?? ""; if (/cheese|capture|photo/.test(last)) capture(); };
    try { r.start(); } catch { /* already started */ } return () => { try { r.stop(); } catch { /* ignore */ } };
  }, [mode, capture]);

  const row = layout === "bottom";
  if (clip) return <VideoEditor clip={clip} onBack={() => { URL.revokeObjectURL(clip.url); setClip(null); }} onDone={(v) => onDoneVideo?.(v)} />;
  if (shot) return <Editor shot={shot} onBack={() => { URL.revokeObjectURL(shot.url); setShot(null); }} onDone={onDone} />;

  return (
    <div className={`glass card ${reducedMotion ? "reduced" : ""}`} style={{ display: "grid", gap: 12, maxWidth: layout === "right" ? 900 : 560 }}>
      <div className="row" role="tablist" aria-label="Camera modes">{(Object.keys(MODES) as CameraMode[]).map((k) => <button key={k} role="tab" aria-selected={k === mode} className={`btn ${k === mode ? "" : "ghost"}`} style={{ padding: ".4em .8em" }} onClick={() => setMode(k)}>{MODES[k].label}</button>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: row ? "1fr" : "1fr 220px", gap: 12 }}>
        <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "#000", aspectRatio: String(ASPECTS[aspect]) }}>
          <video ref={video} playsInline muted style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
          <canvas ref={preview} style={{ width: "100%", height: "100%", display: "block" }} aria-label="Camera preview" />
          <Grid kind={grid} />
          {tilt !== null && grid !== "off" && <div aria-hidden style={{ position: "absolute", left: "10%", right: "10%", top: "50%", height: 2, background: Math.abs(tilt) < 2 ? "#3dff9a" : "#fff", opacity: .8, transform: `rotate(${-tilt}deg)` }} />}
          {tip && <div className="chip" style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,.55)", color: "#fff" }}>{tip}</div>}
          {count > 0 && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: "6rem", color: "#fff", textShadow: "0 4px 20px #0008" }} aria-live="assertive">{count}</div>}
          {screenFlash && <div style={{ position: "absolute", inset: 0, background: "#fff" }} />}
          {err && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, color: "#fff", textAlign: "center" }}>{err}</div>}
          {mode === "360" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, color: "#fff", textAlign: "center", background: "#031a33" }}>360° capture needs a connected 360 camera. Not supported on this device yet.</div>}
        </div>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <label>Zoom {zoom.toFixed(1)}× {caps.zoom ? "" : "(digital)"}<input type="range" min={caps.zoom?.[0] ?? 1} max={Math.min(caps.zoom?.[1] ?? 4, 8)} step={0.1} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
          <label>Exposure<input type="range" min={-2} max={2} step={0.25} value={exposure} onChange={(e) => setExposure(+e.target.value)} /></label>
          <label>Effect intensity<input type="range" min={0} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(+e.target.value)} /></label>
          <div className="row"><select aria-label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} style={{ width: "auto" }}>{Object.keys(ASPECTS).map((a) => <option key={a}>{a}</option>)}</select>
            <select aria-label="Grid" value={grid} onChange={(e) => setGrid(e.target.value as Grid)} style={{ width: "auto" }}><option value="off">No grid</option><option value="thirds">Thirds</option><option value="golden">Golden ratio</option></select>
            <select aria-label="Timer" value={timer} onChange={(e) => setTimer(+e.target.value)} style={{ width: "auto" }}><option value={0}>No timer</option><option value={3}>3s</option><option value={5}>5s</option><option value={10}>10s</option></select></div>
          <div className="row"><button className={`btn ${flash ? "" : "ghost"}`} onClick={() => setFlash(!flash)} aria-pressed={flash}>⚡ Flash</button>
            <button className="btn ghost" onClick={() => setFacing(facing === "user" ? "environment" : "user")}>🔄 Flip</button>
            <button className={`btn ${autoFrame ? "" : "ghost"}`} onClick={() => setAutoFrame(!autoFrame)} aria-pressed={autoFrame} title={window.FaceDetector ? "Follow the subject" : "Needs a browser with face detection"}>🎯 Auto-frame</button>
            <button className="btn ghost" onClick={() => setLayout(layout === "bottom" ? "right" : "bottom")}>↔ Layout</button></div>
          <details className="glass card" style={{ padding: 10 }} open={fxActive(fxOpts)}><summary>✨ Effects {!fxModels && <span className="muted">(models not installed — run <code>npm run setup:vision</code>)</span>}</summary>
            <div style={{ display: "grid", gap: 6, marginTop: 8, opacity: fxModels ? 1 : 0.5, pointerEvents: fxModels ? "auto" : "none" }}>
              <label>Background<select value={fxOpts.background} onChange={(e) => setFxOpts({ ...fxOpts, background: e.target.value as Background })}><option value="none">Original</option><option value="blur">Blur</option><option value="ocean">Ocean</option><option value="sunset">Sunset</option><option value="night">Night sky</option></select></label>
              <label>Mask<select value={fxOpts.mask} onChange={(e) => setFxOpts({ ...fxOpts, mask: e.target.value as ArMask })}><option value="none">None</option><option value="sunglasses">Sunglasses</option><option value="party">Party hat</option><option value="crown">Crown</option><option value="bunny">Bunny ears</option><option value="cat">Cat</option><option value="bubbles">Ocean bubbles</option></select></label>
              <label>Face fun<select value={fxOpts.funny} onChange={(e) => setFxOpts({ ...fxOpts, funny: e.target.value as Funny })}><option value="off">Off</option><option value="bighead">Big head</option><option value="tinyface">Tiny face</option><option value="bigeyes">Big eyes</option></select></label>
              <label>Face swap <span className="muted">(only faces people approved)</span><select value={swapId} onChange={(e) => chooseSwap(e.target.value)}><option value="">Off</option>{swapList.map((x) => <option key={x.id} value={x.id}>{x.name ?? "Sticker face"}</option>)}</select></label>
              {swapNote && <span role="status" className="chip">{swapNote}</span>}
              {fxActive(fxOpts) && !fxReady && <span className="muted">Loading effects…</span>}
            </div></details>
          {res && <span className="muted">{res} · {qualityLabel(...(res.split("×").map(Number) as [number, number]))} (actual sensor output){!window.FaceDetector && " · composition tips unavailable in this browser"}</span>}
        </div>
      </div>
      <div className="row" style={{ justifyContent: "center" }} role="group" aria-label="Capture type">
        <button className={`btn ${kind === "photo" ? "" : "ghost"}`} onClick={() => setKind("photo")} disabled={recording}>Photo</button>
        <button className={`btn ${kind === "video" ? "" : "ghost"}`} onClick={() => setKind("video")} disabled={recording}>Video</button>
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        {recording && <span role="status" className="chip" style={{ background: "#ffe3e3" }}>● {Math.floor(recMs / 60000)}:{String(Math.floor((recMs % 60000) / 1000)).padStart(2, "0")} / 1:00</span>}
        {kind === "video" ? <button onClick={recording ? finishRecording : startRecording} disabled={!!err || mode === "360"} aria-label={recording ? "Stop recording" : "Start recording"} style={{ width: 72, height: 72, borderRadius: recording ? 18 : 99, border: "5px solid #fff", background: recording ? "#d6336c" : "linear-gradient(135deg,#ff5c8a,#d6336c)", boxShadow: "0 6px 20px #d6336c66", cursor: "pointer" }} /> :
        <button onClick={capture} disabled={!!err || mode === "360"} aria-label="Take photo" style={{ width: 72, height: 72, borderRadius: 99, border: "5px solid #fff", background: "linear-gradient(135deg,var(--blue),var(--cyan))", boxShadow: "0 6px 20px #0a84ff66", cursor: "pointer" }} />}
        <label className="btn ghost" style={{ cursor: "pointer" }}>🖼️ Upload<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const b = await createImageBitmap(f); setShot({ blob: f, url: URL.createObjectURL(f), w: b.width, h: b.height }); }} /></label>
      </div>
    </div>);
}

function filterString(base: string, intensity: number, exposure: number, softExposure: boolean) {
  const e = softExposure && exposure ? ` brightness(${1 + exposure * 0.15})` : "";
  // Scale effect strength: blend by repeating the filter at reduced strength via opacity-like interpolation of numeric args.
  const scaled = base === "none" ? "" : base.replace(/(-?\d*\.?\d+)(?=\))/g, (n) => String(1 + (parseFloat(n) - 1) * intensity));
  return `${scaled}${e}`.trim() || "none";
}

function Grid({ kind }: { kind: Grid }) {
  if (kind === "off") return null;
  const L = kind === "thirds" ? thirdLines(100) : goldenLines(100);
  return (<svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
    {L.map((p) => <g key={p} stroke="#fff" strokeOpacity=".55" strokeWidth=".3"><line x1={p} y1="0" x2={p} y2="100" /><line x1="0" y1={p} x2="100" y2={p} /></g>)}</svg>);
}
