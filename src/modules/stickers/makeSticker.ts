export type StickerShape = "square" | "rounded" | "circle";
/** Largest centered square crop of a w×h image, shifted by `focus` (0..1 along the long axis). */
export function squareCrop(w: number, h: number, focus = 0.5) {
  const s = Math.min(w, h);
  return { x: w > h ? Math.round((w - s) * focus) : 0, y: h > w ? Math.round((h - s) * focus) : 0, size: s };
}

/** Renders a sticker: square crop → optional shape mask → optional white sticker outline. Output is a ≤512px WebP/PNG with transparency. */
export async function makeSticker(src: Blob | ImageBitmap, o: { shape: StickerShape; outline: boolean; size?: number; mask?: (c: HTMLCanvasElement) => void }): Promise<Blob> {
  const img = src instanceof ImageBitmap ? src : await createImageBitmap(src);
  const S = Math.min(512, o.size ?? 512), pad = o.outline ? Math.round(S * 0.04) : 0, inner = S - pad * 2;
  const crop = squareCrop(img.width, img.height);
  const c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d")!;
  const shapePath = (ctx: CanvasRenderingContext2D, off: number, size: number) => {
    ctx.beginPath();
    if (o.shape === "circle") ctx.arc(S / 2, S / 2, size / 2, 0, Math.PI * 2);
    else if (o.shape === "rounded") ctx.roundRect(off, off, size, size, size * 0.18);
    else ctx.rect(off, off, size, size);
  };
  if (o.outline) { x.fillStyle = "#fff"; shapePath(x, 0, S); x.fill(); x.shadowColor = "#0003"; }
  x.save(); shapePath(x, pad, inner); x.clip();
  x.drawImage(img, crop.x, crop.y, crop.size, crop.size, pad, pad, inner, inner); x.restore();
  o.mask?.(c);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/webp", 0.9));
}
