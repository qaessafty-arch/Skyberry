"use client";

export interface RecordingPlan { source: "stream" | "canvas"; width: number; height: number; label: string; fps: number }
/**
 * Decide how to record, honestly. Raw device stream keeps native resolution (incl. 4K when the sensor really delivers it) but
 * can't apply crops/effects; compositing through a canvas lets effects apply but caps resolution for performance.
 * We never claim a resolution we aren't recording.
 */
export function recordingPlan(o: { effects: boolean; aspectMatchesSensor: boolean; sensor: { w: number; h: number }; aspect: number; zoom?: number }): RecordingPlan {
  const { w, h } = o.sensor;
  if (!o.effects && o.aspectMatchesSensor && (o.zoom ?? 1) === 1) return { source: "stream", width: w, height: h, label: videoLabel(w, h), fps: 30 };
  // Size of the region actually available after cropping to the aspect (and digital zoom): output is NEVER larger than this.
  let cw = w, ch = w / o.aspect; if (ch > h) { ch = h; cw = h * o.aspect; } cw /= o.zoom ?? 1; ch /= o.zoom ?? 1;
  const cap = o.effects ? 1280 : 1920; const scale = Math.min(1, cap / Math.max(cw, ch));
  let W = Math.round(cw * scale), H = Math.round(ch * scale); W -= W % 2; H -= H % 2; // encoders want even dimensions
  return { source: "canvas", width: W, height: H, label: videoLabel(W, H), fps: o.effects ? 24 : 30 };
}
export function videoLabel(w: number, h: number): string {
  const long = Math.max(w, h), short = Math.min(w, h);
  return long >= 3840 && short >= 2160 ? "4K" : long >= 1920 && short >= 1080 ? "1080p" : long >= 1280 && short >= 720 ? "720p" : "SD";
}

export function pickVideoMime(isSupported: (t: string) => boolean): { mime: string; ext: string } | null {
  for (const [mime, ext] of [["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"], ["video/mp4", "mp4"]] as const) if (isSupported(mime)) return { mime, ext };
  return null;
}

export interface Recorded { blob: Blob; url: string; durationMs: number; width: number; height: number; mime: string; label: string }
export interface RecorderHandle { stop(): Promise<Recorded>; cancel(): void }

/** Start recording a MediaStream (video + optional audio). Bitrate scales with the pixel count. */
export function startRecorder(stream: MediaStream, plan: RecordingPlan, maxMs = 60_000, onAutoStop?: () => void): RecorderHandle | null {
  const fmt = typeof MediaRecorder === "undefined" ? null : pickVideoMime((t) => MediaRecorder.isTypeSupported(t));
  if (!fmt) return null;
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: Math.min(25_000_000, Math.round(plan.width * plan.height * plan.fps * 0.1)) });
  const chunks: Blob[] = []; const t0 = performance.now(); let canceled = false;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Recorded>((resolve, reject) => {
    rec.onstop = () => {
      if (canceled) return reject(new Error("canceled"));
      const blob = new Blob(chunks, { type: fmt.mime.split(";")[0] });
      resolve({ blob, url: URL.createObjectURL(blob), durationMs: performance.now() - t0, width: plan.width, height: plan.height, mime: blob.type, label: plan.label });
    };
    rec.onerror = () => reject(new Error("Recording failed"));
  });
  rec.start(500); const timer = setTimeout(() => { if (rec.state === "recording") { rec.stop(); onAutoStop?.(); } }, maxMs);
  return { stop: () => { clearTimeout(timer); if (rec.state === "recording") rec.stop(); return done; }, cancel: () => { canceled = true; clearTimeout(timer); if (rec.state === "recording") rec.stop(); done.catch(() => {}); } };
}

/** MediaRecorder WebM files report duration = Infinity until seeked; this forces the real value. */
export async function readDuration(v: HTMLVideoElement): Promise<number> {
  if (v.readyState < 1) await new Promise<void>((res) => { v.addEventListener("loadedmetadata", () => res(), { once: true }); });
  if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
  await new Promise<void>((res) => { const done = () => { v.removeEventListener("timeupdate", done); res(); }; v.addEventListener("timeupdate", done); v.currentTime = 1e9; });
  const d = v.duration; v.currentTime = 0; return Number.isFinite(d) ? d : 0;
}
