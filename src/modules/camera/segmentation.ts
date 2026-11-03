"use client";
import { modelsPresent, personMask } from "./vision";

export async function segmentationAvailable(): Promise<boolean> { return modelsPresent(); }

/** Replace everything except the person with transparency (sticker cut-out). Mutates the canvas. */
export async function cutoutCanvas(c: HTMLCanvasElement): Promise<void> {
  const m = await personMask(c); if (!m) throw new Error("Background removal isn't available.");
  const ctx = c.getContext("2d")!; const img = ctx.getImageData(0, 0, c.width, c.height);
  const mask = document.createElement("canvas"); mask.width = m.w; mask.height = m.h; const mc = mask.getContext("2d")!; const md = mc.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) { const a = Math.max(0, Math.min(1, (m.data[i] - 0.3) / 0.4)) * 255; md.data[i * 4 + 3] = a; }
  mc.putImageData(md, 0, 0);
  const sm = document.createElement("canvas"); sm.width = c.width; sm.height = c.height; const sc = sm.getContext("2d")!; sc.imageSmoothingQuality = "high"; sc.drawImage(mask, 0, 0, c.width, c.height);
  const alpha = sc.getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = Math.min(img.data[i + 3], alpha[i + 3]);
  ctx.putImageData(img, 0, 0);
}
