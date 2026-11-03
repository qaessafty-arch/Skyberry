export type ArtKind = "waves" | "bubbles" | "aurora";
/** Small seeded PRNG so "Surprise me" results are reproducible per seed. */
export function rng(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

/** Procedurally drawn ocean-themed wallpaper (NOT AI-generated; deterministic from the seed). */
export async function generateBackground(kind: ArtKind, seed: number, w = 1080, h = 1920): Promise<Blob> {
  const r = rng(seed); const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d")!;
  const hue = 190 + Math.floor(r() * 40);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `hsl(${hue},90%,62%)`); g.addColorStop(0.55, `hsl(${hue + 15},85%,42%)`); g.addColorStop(1, `hsl(${hue + 30},80%,16%)`); x.fillStyle = g; x.fillRect(0, 0, w, h);
  if (kind === "waves") for (let i = 0; i < 9; i++) { const y0 = h * (0.25 + i * 0.09), amp = 20 + r() * 50, f = 0.004 + r() * 0.006, ph = r() * 6.28; x.beginPath(); x.moveTo(0, h); for (let px = 0; px <= w; px += 8) x.lineTo(px, y0 + Math.sin(px * f + ph) * amp); x.lineTo(w, h); x.closePath(); x.fillStyle = `hsla(${hue + i * 4},90%,${70 - i * 6}%,0.28)`; x.fill(); }
  else if (kind === "bubbles") for (let i = 0; i < 70; i++) { const rad = 8 + r() * r() * 90; x.beginPath(); x.arc(r() * w, r() * h, rad, 0, 7); x.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`; x.lineWidth = 2 + r() * 3; x.stroke(); x.fillStyle = `rgba(255,255,255,${r() * 0.12})`; x.fill(); }
  else for (let i = 0; i < 5; i++) { const gx = x.createRadialGradient(r() * w, r() * h * 0.7, 10, r() * w, r() * h, 500 + r() * 400); gx.addColorStop(0, `hsla(${150 + r() * 120},95%,65%,0.45)`); gx.addColorStop(1, "transparent"); x.fillStyle = gx; x.fillRect(0, 0, w, h); }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/webp", 0.85));
}
