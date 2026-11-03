export interface Pt { x: number; y: number }
export interface FaceFrame { center: Pt; eyeL: Pt; eyeR: Pt; angle: number; eyeDist: number; width: number; top: Pt; chin: Pt; nose: Pt; mouth: Pt; height: number }

// MediaPipe Face Mesh landmark indices
export const LM = { eyeOuterA: 33, eyeOuterB: 263, eyeInnerA: 133, eyeInnerB: 362, nose: 1, forehead: 10, chin: 152, lipTop: 13, lipBottom: 14, cheekA: 234, cheekB: 454 } as const;

/** Pixel-space face frame from normalised (0..1) landmarks. Eye order is by x so mirroring can't flip left/right. */
export function faceFrame(lm: Pt[], w: number, h: number): FaceFrame | null {
  const g = (i: number): Pt | null => (lm[i] ? { x: lm[i].x * w, y: lm[i].y * h } : null);
  const a = g(LM.eyeOuterA), b = g(LM.eyeOuterB), top = g(LM.forehead), chin = g(LM.chin), nose = g(LM.nose), lt = g(LM.lipTop), lb = g(LM.lipBottom), ca = g(LM.cheekA), cb = g(LM.cheekB);
  if (!a || !b || !top || !chin || !nose || !lt || !lb || !ca || !cb) return null;
  const [eyeL, eyeR] = a.x <= b.x ? [a, b] : [b, a];
  const d = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
  return { eyeL, eyeR, center: { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 }, angle: Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x), eyeDist: d(eyeL, eyeR), width: d(ca, cb), top, chin, nose, mouth: { x: (lt.x + lb.x) / 2, y: (lt.y + lb.y) / 2 }, height: d(top, chin) };
}

/** Is the face large/centred enough to place effects on (ignore tiny background faces)? */
export const usableFace = (f: FaceFrame, w: number, h: number) => f.width > w * 0.08 && f.center.x > 0 && f.center.x < w && f.center.y > 0 && f.center.y < h;

/** Similarity transform (scale + rotation + translation) taking source eye/mouth anchors onto the target's. Used by face swap. */
export function similarity(src: FaceFrame, dst: FaceFrame) {
  const scale = dst.eyeDist / Math.max(1e-6, src.eyeDist); const rot = dst.angle - src.angle;
  return { scale, rot, tx: dst.center.x - (Math.cos(rot) * src.center.x - Math.sin(rot) * src.center.y) * scale, ty: dst.center.y - (Math.sin(rot) * src.center.x + Math.cos(rot) * src.center.y) * scale };
}
