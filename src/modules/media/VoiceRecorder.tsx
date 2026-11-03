"use client";
import { useEffect, useRef, useState } from "react";

const MAX_MS = 3 * 60_000;
/** Picks a container the browser can actually record (Safari = mp4, others = webm/opus). */
export function pickAudioMime(isSupported: (t: string) => boolean): { mime: string; ext: string } | null {
  for (const [mime, ext] of [["audio/webm;codecs=opus", "webm"], ["audio/webm", "webm"], ["audio/mp4", "m4a"], ["audio/ogg;codecs=opus", "ogg"]] as const) if (isSupported(mime)) return { mime, ext };
  return null;
}

/** Record → preview → send. Nothing leaves the device until the user presses Send. */
export function VoiceRecorder({ onSend, disabled }: { onSend: (f: File) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "review">("idle");
  const [ms, setMs] = useState(0); const [err, setErr] = useState(""); const [clip, setClip] = useState<{ file: File; url: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const stream = useRef<MediaStream | null>(null); const t0 = useRef(0); const canceled = useRef(false);
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); if (clip) URL.revokeObjectURL(clip.url); }, [clip]);
  useEffect(() => { if (state !== "recording") return; const id = setInterval(() => { const e = Date.now() - t0.current; setMs(e); if (e >= MAX_MS) rec.current?.stop(); }, 200); return () => clearInterval(id); }, [state]);

  async function start() {
    setErr("");
    const fmt = typeof MediaRecorder === "undefined" ? null : pickAudioMime((t) => MediaRecorder.isTypeSupported(t));
    if (!fmt) return setErr("Voice notes aren't supported in this browser.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { return setErr(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was denied." : "No microphone found."); }
    chunks.current = []; canceled.current = false;
    const r = new MediaRecorder(stream.current, { mimeType: fmt.mime }); rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (canceled.current || !chunks.current.length) return setState("idle");
      const blob = new Blob(chunks.current, { type: fmt.mime.split(";")[0] });
      const file = new File([blob], `voice-${Date.now()}.${fmt.ext}`, { type: blob.type });
      setClip({ file, url: URL.createObjectURL(file) }); setState("review");
    };
    t0.current = Date.now(); setMs(0); r.start(250); setState("recording");
  }
  const stop = () => rec.current?.stop();
  const cancel = () => { canceled.current = true; if (rec.current?.state === "recording") rec.current.stop(); else setState("idle"); if (clip) URL.revokeObjectURL(clip.url); setClip(null); setState("idle"); };
  const fmt = (n: number) => `${Math.floor(n / 60000)}:${String(Math.floor((n % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <span className="row" style={{ gap: 6 }}>
      {state === "idle" && <button type="button" className="btn ghost" disabled={disabled} onClick={start} aria-label="Record a voice note">🎙️</button>}
      {state === "recording" && <><span role="status" aria-live="polite" className="chip" style={{ background: "#ffe3e3" }}>● {fmt(ms)}</span><button type="button" className="btn" onClick={stop}>Stop</button><button type="button" className="btn ghost" onClick={cancel}>Cancel</button></>}
      {state === "review" && clip && <><audio src={clip.url} controls style={{ height: 34 }} /><button type="button" className="btn" onClick={() => { onSend(clip.file); setClip(null); setState("idle"); }}>Send</button><button type="button" className="btn ghost" onClick={cancel}>Discard</button></>}
      {err && <span role="alert" className="chip" style={{ background: "#ffe3e3" }}>{err}</span>}
    </span>
  );
}
