/** Radial lens warp for the "Funny" modes. Positive strength bulges (giant head), negative pinches (tiny face). */
export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

export function warpImage(src: Pixels, cx: number, cy: number, radius: number, strength: number): Pixels {
  const { width: w, height: h } = src;
  const out: Pixels = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const s = src.data, d = out.data;
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy, dist2 = dx * dx + dy * dy;
      let sx = x, sy = y;
      if (dist2 < r2 && strength !== 0) {
        const t = Math.sqrt(dist2) / radius;           // 0 at center → 1 at edge
        const k = 1 - strength * (1 - t) * (1 - t);    // <1 magnifies, >1 shrinks
        sx = cx + dx * k; sy = cy + dy * k;
      }
      const ix = Math.min(w - 1, Math.max(0, Math.round(sx))), iy = Math.min(h - 1, Math.max(0, Math.round(sy)));
      const si = (iy * w + ix) * 4, di = (y * w + x) * 4;
      d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
    }
  }
  return out;
}
