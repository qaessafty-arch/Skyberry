"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeshCall, type PeerView } from "./mesh";
import type { Signaling } from "./signaling";

const Q_COLOR = { good: "#2fbf71", fair: "#f0ad2e", poor: "#d6336c" } as const;

function Tile({ name, stream, muted, mic, cam, screen, quality, local, sinkId }: { name: string; stream: MediaStream | null; muted?: boolean; mic: boolean; cam: boolean; screen?: boolean; quality?: keyof typeof Q_COLOR; local?: boolean; sinkId?: string }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (v.current && v.current.srcObject !== stream) v.current.srcObject = stream; }, [stream]);
  useEffect(() => { const el = v.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null; if (el?.setSinkId && sinkId) el.setSinkId(sinkId).catch(() => {}); }, [sinkId]);
  const showVideo = cam && stream && stream.getVideoTracks().length > 0;
  return (
    <div data-testid={local ? "tile-local" : "tile-remote"} style={{ position: "relative", background: "#031a33", borderRadius: 18, overflow: "hidden", aspectRatio: "16/10", display: "grid", placeItems: "center", color: "#fff" }}>
      <video ref={v} autoPlay playsInline muted={muted} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: screen ? "contain" : "cover", transform: local && !screen ? "scaleX(-1)" : undefined, visibility: showVideo ? "visible" : "hidden" }} />
      {!showVideo && <div style={{ fontSize: "2.4rem", width: 84, height: 84, borderRadius: 99, background: "linear-gradient(135deg,#0a84ff,#19e3ff)", display: "grid", placeItems: "center" }} aria-hidden>{name[0]?.toUpperCase()}</div>}
      <div className="row" style={{ position: "absolute", left: 8, bottom: 8, gap: 6, background: "#0008", borderRadius: 10, padding: "2px 8px", fontSize: ".85rem" }}>
        <span>{name}{local ? " (you)" : ""}</span>{!mic && <span title="Muted">🔇</span>}{screen && <span title="Sharing screen">🖥️</span>}
        {quality && <span title={`Connection: ${quality}`} aria-label={`Connection ${quality}`} style={{ width: 9, height: 9, borderRadius: 9, background: Q_COLOR[quality], display: "inline-block" }} />}
      </div>
    </div>);
}

/** Lobby (device check + preview) → call grid with mic / camera / screen share / speaker / leave. */
export function CallRoom({ selfId, name, sig, mode, iceServers, title, onLeave, onStart, onEnd }: { selfId: string; name: string; sig: Signaling; mode: "audio" | "video"; iceServers: RTCIceServer[]; title: string; onLeave: () => void; onStart?: () => void; onEnd?: () => void }) {
  const [phase, setPhase] = useState<"lobby" | "call">("lobby"); const [err, setErr] = useState("");
  const [preview, setPreview] = useState<MediaStream | null>(null); const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [startMuted, setStartMuted] = useState(false); const [camOn, setCamOn] = useState(mode === "video");
  const [, force] = useState(0); const [toasts, setToasts] = useState<string[]>([]); const [sink, setSink] = useState(""); const [sharing, setSharing] = useState(false);
  const handedOver = useRef<MediaStream | null>(null); // tracks owned by the call; the lobby cleanup must not stop these
  const mesh = useRef<MeshCall | null>(null); const [peers, setPeers] = useState<PeerView[]>([]);

  const refreshDevices = useCallback(async () => setDevices(await navigator.mediaDevices.enumerateDevices()), []);
  // lobby preview
  useEffect(() => {
    if (phase !== "lobby") return; let live = true; let s: MediaStream | null = null;
    (async () => {
      try { s = await navigator.mediaDevices.getUserMedia({ audio: true, video: camOn ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false }); if (!live) return s.getTracks().forEach((t) => t.stop()); setPreview(s); setErr(""); refreshDevices(); }
      catch (e) { const n = e instanceof DOMException ? e.name : ""; setErr(n === "NotAllowedError" ? "Camera/microphone permission was denied. Allow it in your browser's site settings to join." : n === "NotFoundError" ? "No microphone or camera was found." : "Couldn't access your devices."); }
    })();
    return () => { live = false; if (s && s !== handedOver.current) s.getTracks().forEach((t) => t.stop()); };
  }, [phase, camOn, refreshDevices]);
  useEffect(() => () => mesh.current?.leave(), []);

  async function join() {
    if (!preview) return; const local = preview; handedOver.current = local; setPreview(null); // hand the tracks over to the call
    local.getAudioTracks().forEach((t) => (t.enabled = !startMuted));
    const m = new MeshCall({ selfId, name, sig, iceServers, onChange: () => { setPeers(m.views()); force((n) => n + 1); }, onEvent: (e) => { setToasts((t) => [...t.slice(-3), `${e.name} ${e.kind === "joined" ? "joined" : "left"}`]); setTimeout(() => setToasts((t) => t.slice(1)), 4000); } });
    m.mic = !startMuted; mesh.current = m;
    try { await m.start(local); setPhase("call"); onStart?.(); } catch { setErr("Couldn't connect to the call. Please try again."); local.getTracks().forEach((t) => t.stop()); mesh.current = null; }
  }
  function leave() { mesh.current?.leave(); mesh.current = null; onEnd?.(); onLeave(); }
  const m = mesh.current; const pick = (kind: MediaDeviceKind) => devices.filter((d) => d.kind === kind);

  if (phase === "lobby") return (
    <div className="glass card" style={{ display: "grid", gap: 10, maxWidth: 560 }}>
      <h2>{title}</h2>
      {err ? <p role="alert" className="chip" style={{ background: "#ffe3e3", whiteSpace: "normal" }}>{err}</p> : <Tile name={name} stream={preview} muted mic cam={camOn} local />}
      <div className="row"><label className="chip"><input type="checkbox" style={{ width: "auto" }} checked={camOn} onChange={(e) => setCamOn(e.target.checked)} />Camera</label><label className="chip"><input type="checkbox" style={{ width: "auto" }} checked={startMuted} onChange={(e) => setStartMuted(e.target.checked)} />Join muted</label></div>
      <div className="row"><button className="btn" disabled={!preview} onClick={join}>Join call</button><button className="btn ghost" onClick={onLeave}>Cancel</button></div>
    </div>);

  const local = m?.local ?? null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><b>{title}</b><span className="muted" aria-live="polite">{peers.length + 1} in call</span></div>
      <div role="status" aria-live="polite" style={{ minHeight: 22 }}>{toasts.map((t, i) => <span key={i} className="chip" style={{ marginRight: 6 }}>{t}</span>)}</div>
      <div data-testid="grid" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${peers.length ? 240 : 360}px,1fr))`, gap: 10 }}>
        <Tile name={name} stream={sharing ? m?.screen ?? local : local} muted mic={m?.mic ?? true} cam={sharing || (m?.cam ?? false)} screen={sharing} local />
        {peers.map((p) => <Tile key={p.id} name={p.name} stream={p.stream} mic={p.mic} cam={p.cam || p.screen} screen={p.screen} quality={p.quality} sinkId={sink} />)}
      </div>
      {!peers.length && <p className="muted">Waiting for others to join…</p>}
      <div className="row" style={{ justifyContent: "center" }}>
        <button className={`btn ${m?.mic ? "ghost" : ""}`} onClick={() => m?.setMic(!m.mic)} aria-pressed={!m?.mic} aria-label={m?.mic ? "Mute microphone" : "Unmute microphone"}>{m?.mic ? "🎙️ Mute" : "🔇 Unmute"}</button>
        <button className={`btn ${m?.cam ? "ghost" : ""}`} onClick={() => m?.setCam(!m.cam)} aria-pressed={!m?.cam} aria-label={m?.cam ? "Turn camera off" : "Turn camera on"} disabled={!local?.getVideoTracks().length}>{m?.cam ? "📷 Camera off" : "📷 Camera on"}</button>
        <button className={`btn ${sharing ? "" : "ghost"}`} onClick={async () => { if (sharing) { await m?.stopScreen(); setSharing(false); } else setSharing(await (m?.shareScreen() ?? false)); }} aria-pressed={sharing}>🖥️ {sharing ? "Stop sharing" : "Share screen"}</button>
        <button className="btn" style={{ background: "#d6336c" }} onClick={leave}>Leave</button>
      </div>
      <details className="glass card"><summary>Devices</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <label>Microphone <select onChange={(e) => m?.switchDevice("audio", e.target.value)} defaultValue="">{<option value="" disabled>Choose…</option>}{pick("audioinput").map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}</select></label>
          <label>Camera <select onChange={(e) => m?.switchDevice("video", e.target.value)} defaultValue="">{<option value="" disabled>Choose…</option>}{pick("videoinput").map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>)}</select></label>
          {"setSinkId" in HTMLMediaElement.prototype && <label>Speaker <select value={sink} onChange={(e) => setSink(e.target.value)}><option value="">Default</option>{pick("audiooutput").map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Speaker"}</option>)}</select></label>}
        </div></details>
    </div>);
}
