"use client";
import { getLandmarker, monotonicTs, personMask } from "./vision";
import { faceFrame, usableFace, similarity, type FaceFrame, type Pt } from "./faceGeometry";
import { warpImage, type Pixels } from "./warp";

export type Background = "none" | "blur" | "ocean" | "sunset" | "night";
export type ArMask = "none" | "sunglasses" | "party" | "crown" | "bunny" | "cat" | "bubbles";
export type Funny = "off" | "bighead" | "tinyface" | "bigeyes";
export interface FxOptions { background: Background; mask: ArMask; funny: Funny; strength: number; swap: SwapSource | null }
export interface SwapSource { bitmap: ImageBitmap; frame: FaceFrame; oval: Pt[] }
export const NO_FX: FxOptions = { background: "none", mask: "none", funny: "off", strength: 1, swap: null };
export const fxActive = (o: FxOptions) => o.background !== "none" || o.mask !== "none" || o.funny !== "off" || !!o.swap;

// FACE_OVAL indices (outline of the face) from the MediaPipe mesh
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/** Detect a face in a still image (for face-swap sources). */
export async function detectFace(img: ImageBitmap): Promise<{ frame: FaceFrame; oval: Pt[] } | null> {
  const lm = await getLandmarker("IMAGE"); if (!lm) return null;
  const r = lm.detect(img); const l = r.faceLandmarks[0]; if (!l) return null;
  const frame = faceFrame(l, img.width, img.height); if (!frame) return null;
  return { frame, oval: OVAL.map((i) => ({ x: l[i].x * img.width, y: l[i].y * img.height })) };
}

/**
 * Per-frame effects. Heavy detection runs at a throttled rate and its results are reused for the frames in between,
 * which keeps the preview smooth on mid-range phones. Everything degrades to "no effect" if models can't load.
 */
export class Fx {
  private mask: { data: Float32Array; w: number; h: number } | null = null; private lastSeg = 0; private lastFace = 0;
  face: FaceFrame | null = null; private oval: Pt[] = []; private busy = false; ready = false; private bgCache = new Map<string, HTMLCanvasElement>();
  /** ms per frame spent in detection, averaged — callers can lower the rate on slow devices. */
  avgCost = 0;

  async init(needFace: boolean, needSeg: boolean) { const [l] = await Promise.all([needFace ? getLandmarker("VIDEO") : null, needSeg ? import("./vision").then((v) => v.getSegmenter()) : null]); this.ready = !!l || needSeg; return this.ready; }

  async update(canvas: HTMLCanvasElement, o: FxOptions, now: number, force = false) {
    if (this.busy) return; this.busy = true; if (force) { this.lastFace = -1e9; this.lastSeg = -1e9; } const t0 = performance.now();
    try {
      const gap = Math.max(60, this.avgCost * 1.5); // adaptive: back off when detection is slow
      const needFace = o.mask !== "none" || o.funny !== "off" || !!o.swap;
      if (needFace && now - this.lastFace > gap) {
        this.lastFace = now; const lm = await getLandmarker("VIDEO");
        const r = lm?.detectForVideo(canvas, monotonicTs(now)); const l = r?.faceLandmarks?.[0]; const f = l ? faceFrame(l, canvas.width, canvas.height) : null;
        this.face = f && usableFace(f, canvas.width, canvas.height) ? f : null; this.oval = this.face && l ? OVAL.map((i) => ({ x: l[i].x * canvas.width, y: l[i].y * canvas.height })) : [];
      }
      if (o.background !== "none" && now - this.lastSeg > gap) { this.lastSeg = now; this.mask = await personMask(canvas); }
    } finally { this.busy = false; this.avgCost = this.avgCost * 0.8 + (performance.now() - t0) * 0.2; }
  }

  /** Apply all active effects onto the (already cropped/filtered/mirrored) canvas. */
  apply(c: HTMLCanvasElement, o: FxOptions, t: number) {
    const ctx = c.getContext("2d")!;
    if (o.funny !== "off" && this.face) this.distort(ctx, c, o);
    if (o.background !== "none" && this.mask) this.background(ctx, c, o.background);
    if (o.swap && this.face) this.swap(ctx, o.swap);
    if (o.mask !== "none" && this.face) drawMask(ctx, o.mask, this.face, t);
  }

  private distort(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, o: FxOptions) {
    const f = this.face!; const id = ctx.getImageData(0, 0, c.width, c.height);
    const s = o.strength;
    if (o.funny === "bigeyes") { let px: Pixels = id; for (const e of [f.eyeL, f.eyeR]) px = warpImage(px, e.x, e.y, f.eyeDist * 0.45, 0.8 * s); ctx.putImageData(new ImageData(px.data as unknown as Uint8ClampedArray<ArrayBuffer>, c.width, c.height), 0, 0); return; }
    const strength = (o.funny === "bighead" ? 0.75 : -0.7) * s; const w = warpImage(id, f.center.x, (f.center.y + f.chin.y) / 2, f.width * 1.1, strength);
    ctx.putImageData(new ImageData(w.data as unknown as Uint8ClampedArray<ArrayBuffer>, c.width, c.height), 0, 0);
  }

  private background(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, bg: Background) {
    const m = this.mask!; const person = document.createElement("canvas"); person.width = c.width; person.height = c.height; const pc = person.getContext("2d")!; pc.drawImage(c, 0, 0);
    // soft alpha from the confidence map, scaled to the frame
    const mk = document.createElement("canvas"); mk.width = m.w; mk.height = m.h; const mctx = mk.getContext("2d")!; const md = mctx.createImageData(m.w, m.h);
    for (let i = 0; i < m.data.length; i++) md.data[i * 4 + 3] = Math.max(0, Math.min(1, (m.data[i] - 0.35) / 0.3)) * 255;
    mctx.putImageData(md, 0, 0); pc.globalCompositeOperation = "destination-in"; pc.imageSmoothingQuality = "high"; pc.drawImage(mk, 0, 0, c.width, c.height);
    // background layer
    if (bg === "blur") { const blurPx = Math.max(6, Math.round(c.width / 40)); ctx.filter = `blur(${blurPx}px)`; ctx.drawImage(c, 0, 0); ctx.filter = "none"; }
    else ctx.drawImage(this.gradient(bg as Exclude<Background, "none" | "blur">, c.width, c.height), 0, 0);
    ctx.drawImage(person, 0, 0);
  }
  private gradient(bg: Exclude<Background, "none" | "blur">, w: number, h: number) {
    const key = `${bg}${w}x${h}`; const ex = this.bgCache.get(key); if (ex) return ex;
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d")!; const g = x.createLinearGradient(0, 0, 0, h);
    const stops = { ocean: ["#19e3ff", "#0a84ff", "#06223f"], sunset: ["#ffd6a5", "#ff9a8b", "#6d5bff"], night: ["#0b1d51", "#10002b", "#02040f"] }[bg]; stops.forEach((s, i) => g.addColorStop(i / 2, s)); x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (bg === "ocean") { x.fillStyle = "#ffffff33"; for (let i = 0; i < 24; i++) { x.beginPath(); x.arc((i * 137) % w, (i * 211) % h, 4 + (i % 5) * 4, 0, 7); x.fill(); } }
    this.bgCache.set(key, c); return c;
  }

  /** Face swap-lite: align the source face (similarity transform on eyes) and blend it through a feathered face-oval mask. */
  private swap(ctx: CanvasRenderingContext2D, src: SwapSource) {
    const f = this.face!; if (!this.oval.length) return; const t = similarity(src.frame, f);
    const layer = document.createElement("canvas"); layer.width = ctx.canvas.width; layer.height = ctx.canvas.height; const lc = layer.getContext("2d")!;
    lc.save(); lc.setTransform(Math.cos(t.rot) * t.scale, Math.sin(t.rot) * t.scale, -Math.sin(t.rot) * t.scale, Math.cos(t.rot) * t.scale, t.tx, t.ty); lc.drawImage(src.bitmap, 0, 0); lc.restore();
    lc.globalCompositeOperation = "destination-in"; lc.filter = `blur(${Math.max(2, f.width / 25)}px)`; lc.beginPath(); this.oval.forEach((p, i) => (i ? lc.lineTo(p.x, p.y) : lc.moveTo(p.x, p.y))); lc.closePath(); lc.fillStyle = "#000"; lc.fill(); lc.filter = "none";
    ctx.drawImage(layer, 0, 0);
  }
}

/** AR masks drawn from canvas primitives, positioned and rotated by the tracked face. */
export function drawMask(ctx: CanvasRenderingContext2D, kind: ArMask, f: FaceFrame, t: number) {
  const u = f.eyeDist; ctx.save(); ctx.translate(f.center.x, f.center.y); ctx.rotate(f.angle);
  const up = (f.center.y - f.top.y) / Math.max(1, u); // forehead height in eye-distances
  switch (kind) {
    case "sunglasses": ctx.fillStyle = "#0b1a33"; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * u * 0.5, 0, u * 0.36, u * 0.26, 0, 0, 7); ctx.fill(); } ctx.fillRect(-u * 0.15, -u * 0.04, u * 0.3, u * 0.08); ctx.fillStyle = "#ffffff55"; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * u * 0.4, -u * 0.08, u * 0.1, u * 0.05, -0.4, 0, 7); ctx.fill(); } break;
    case "party": ctx.fillStyle = "#ff7ad9"; ctx.beginPath(); ctx.moveTo(-u * 0.5, -u * up * 0.9); ctx.lineTo(u * 0.5, -u * up * 0.9); ctx.lineTo(0, -u * (up + 1.5)); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -u * (up + 1.5), u * 0.12, 0, 7); ctx.fill(); break;
    case "crown": ctx.fillStyle = "#ffd166"; ctx.strokeStyle = "#ffb300"; ctx.lineWidth = u * 0.04; ctx.beginPath(); ctx.moveTo(-u * 0.7, -u * up * 0.95); for (let i = 0; i <= 4; i++) { ctx.lineTo(-u * 0.7 + i * u * 0.35, -u * (up + (i % 2 ? 0.1 : 0.6))); } ctx.lineTo(u * 0.7, -u * up * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "bunny": for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * u * 0.45, -u * up * 0.9); ctx.rotate(sx * 0.2 + Math.sin(t / 400) * 0.05); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(0, -u * 0.8, u * 0.2, u * 0.8, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#ffb3d1"; ctx.beginPath(); ctx.ellipse(0, -u * 0.8, u * 0.1, u * 0.6, 0, 0, 7); ctx.fill(); ctx.restore(); } break;
    case "cat": { const ny = (f.nose.y - f.center.y) / Math.cos(f.angle); ctx.fillStyle = "#ff8fb1"; ctx.beginPath(); ctx.moveTo(-u * 0.1, ny); ctx.lineTo(u * 0.1, ny); ctx.lineTo(0, ny + u * 0.14); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = u * 0.03; for (const sx of [-1, 1]) for (const dy of [-0.05, 0.08]) { ctx.beginPath(); ctx.moveTo(sx * u * 0.2, ny + u * dy); ctx.lineTo(sx * u * 0.75, ny + u * (dy * 2)); ctx.stroke(); } ctx.fillStyle = "#ffb3d1"; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * u * 0.35, -u * up * 0.9); ctx.lineTo(sx * u * 0.7, -u * (up + 0.5)); ctx.lineTo(sx * u * 0.8, -u * up * 0.75); ctx.closePath(); ctx.fill(); } break; }
    case "bubbles": ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = u * 0.03; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + t / 1500, r = u * 1.6 + Math.sin(t / 500 + i) * u * 0.1; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r * 0.9, u * (0.12 + (i % 3) * 0.05), 0, 7); ctx.stroke(); } break;
  }
  ctx.restore();
}
