export type FaceBox = { x: number; y: number; width: number; height: number };

export const ASPECTS = { "1:1": 1, "4:5": 4 / 5, "3:4": 3 / 4, "9:16": 9 / 16, "16:9": 16 / 9, "21:9": 21 / 9 } as const;
export type Aspect = keyof typeof ASPECTS;

/** Largest centered crop of a (w×h) frame with the target aspect, shifted toward `focus` (0..1) when given. */
export function cropFor(w: number, h: number, aspect: number, focus?: { x: number; y: number }, zoom = 1) {
  let cw = w, ch = h;
  if (w / h > aspect) cw = h * aspect; else ch = w / aspect;
  cw /= zoom; ch /= zoom;
  const fx = (focus?.x ?? 0.5) * w, fy = (focus?.y ?? 0.5) * h;
  const x = Math.min(w - cw, Math.max(0, fx - cw / 2)), y = Math.min(h - ch, Math.max(0, fy - ch / 2));
  return { x, y, w: cw, h: ch };
}

/** Rule-of-thirds guidance for a face center (normalised 0..1). Returns a short instruction. */
export function guidance(face: FaceBox | null, frame: { w: number; h: number }, mode: "portrait" | "group" = "portrait"): string {
  if (!face) return "Looking for faces…";
  const cx = (face.x + face.width / 2) / frame.w, cy = (face.y + face.height / 2) / frame.h;
  const size = face.height / frame.h;
  if (mode === "portrait") {
    if (size < 0.18) return "Move closer";
    if (size > 0.6) return "Step back a little";
    if (cy > 0.5) return "Tilt up — eyes near the top third";
    if (Math.abs(cx - 0.5) > 0.2 && Math.abs(Math.abs(cx - 0.5) - 1 / 6) > 0.08) return cx < 0.5 ? "Pan left a touch for thirds" : "Pan right a touch for thirds";
  }
  return "Great framing ✨";
}

/** Group framing: bounding box of all faces; returns advice and a focus point for auto-framing. */
export function groupFraming(faces: FaceBox[], frame: { w: number; h: number }) {
  if (!faces.length) return { advice: "Gather everyone in view", focus: undefined };
  const x0 = Math.min(...faces.map((f) => f.x)), x1 = Math.max(...faces.map((f) => f.x + f.width));
  const y0 = Math.min(...faces.map((f) => f.y)), y1 = Math.max(...faces.map((f) => f.y + f.height));
  const edge = x0 < frame.w * 0.04 || x1 > frame.w * 0.96;
  return { advice: edge ? "Someone's near the edge — widen the shot" : `${faces.length} in frame ✨`, focus: { x: (x0 + x1) / 2 / frame.w, y: (y0 + y1) / 2 / frame.h } };
}

export const goldenLines = (n: number) => [n * 0.382, n * 0.618];
export const thirdLines = (n: number) => [n / 3, (2 * n) / 3];
