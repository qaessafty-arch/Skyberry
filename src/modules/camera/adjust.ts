import type { Pixels } from "./warp";

export interface Adjust { brightness: number; contrast: number; saturation: number; sharpness: number; highlights: number; shadows: number } // each -1..1 (sharpness 0..1)
export const NEUTRAL: Adjust = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0, highlights: 0, shadows: 0 };
export const isNeutral = (a: Adjust) => (Object.keys(NEUTRAL) as (keyof Adjust)[]).every((k) => a[k] === 0);

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Per-pixel tone/colour adjustments, then an optional unsharp pass. Pure so it's testable without a canvas. */
export function applyAdjust(src: Pixels, a: Adjust): Pixels {
  if (isNeutral(a)) return src;
  const { width: w, height: h } = src; const d = new Uint8ClampedArray(src.data);
  const contrast = 1 + a.contrast, sat = 1 + a.saturation;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // highlights lift/lower bright areas, shadows lift/lower dark areas (smooth falloff by luminance)
    const hl = a.highlights * 60 * Math.max(0, (lum - 128) / 127), sh = a.shadows * 60 * Math.max(0, (128 - lum) / 128);
    const add = a.brightness * 80 + hl + sh;
    r += add; g += add; b += add;
    r = (r - 128) * contrast + 128; g = (g - 128) * contrast + 128; b = (b - 128) * contrast + 128;
    const l2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l2 + (r - l2) * sat; g = l2 + (g - l2) * sat; b = l2 + (b - l2) * sat;
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
  if (a.sharpness > 0) {
    const out = new Uint8ClampedArray(d), k = a.sharpness * 0.8;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) for (let c = 0; c < 3; c++) {
      const i = (y * w + x) * 4 + c;
      const blur = (d[i - 4] + d[i + 4] + d[i - w * 4] + d[i + w * 4]) / 4;
      out[i] = clamp(d[i] + (d[i] - blur) * k * 2);
    }
    return { width: w, height: h, data: out };
  }
  return { width: w, height: h, data: d };
}

/** Honest quality badge from the ACTUAL pixel size of what was captured — never from what was requested. */
export function qualityLabel(w: number, h: number): "4K" | "1440p" | "1080p" | "HD" | "SD" {
  const long = Math.max(w, h), short = Math.min(w, h);
  if (long >= 3840 && short >= 2160) return "4K";
  if (long >= 2560 && short >= 1440) return "1440p";
  if (long >= 1920 && short >= 1080) return "1080p";
  if (long >= 1280 && short >= 720) return "HD";
  return "SD";
}

export interface History<T> { past: T[]; present: T; future: T[] }
export const hist = <T,>(t: T): History<T> => ({ past: [], present: t, future: [] });
export const commit = <T,>(h: History<T>, next: T): History<T> => ({ past: [...h.past, h.present].slice(-50), present: next, future: [] });
export const undo = <T,>(h: History<T>): History<T> => (h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h);
export const redo = <T,>(h: History<T>): History<T> => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h);
