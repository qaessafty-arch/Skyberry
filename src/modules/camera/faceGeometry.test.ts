import { describe, it, expect } from "vitest";
import { faceFrame, LM, similarity, usableFace, type Pt } from "./faceGeometry";

function synthetic(cx: number, cy: number, eyeDist: number, angle: number): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const rot = (dx: number, dy: number) => ({ x: cx + dx * Math.cos(angle) - dy * Math.sin(angle), y: cy + dx * Math.sin(angle) + dy * Math.cos(angle) });
  lm[LM.eyeOuterA] = rot(-eyeDist / 2, 0); lm[LM.eyeOuterB] = rot(eyeDist / 2, 0);
  lm[LM.forehead] = rot(0, -eyeDist * 0.9); lm[LM.chin] = rot(0, eyeDist * 1.6); lm[LM.nose] = rot(0, eyeDist * 0.4);
  lm[LM.lipTop] = rot(0, eyeDist * 0.9); lm[LM.lipBottom] = rot(0, eyeDist * 1.0); lm[LM.cheekA] = rot(-eyeDist * 0.9, eyeDist * 0.3); lm[LM.cheekB] = rot(eyeDist * 0.9, eyeDist * 0.3);
  return lm;
}
describe("faceFrame", () => {
  it("level face: angle 0, centre between eyes, pixel scale applied", () => {
    const f = faceFrame(synthetic(0.5, 0.4, 0.2, 0), 1000, 500)!;
    expect(f.angle).toBeCloseTo(0); expect(f.center.x).toBeCloseTo(500); expect(f.center.y).toBeCloseTo(200); expect(f.eyeDist).toBeCloseTo(200);
  });
  it("recovers head roll", () => expect(faceFrame(synthetic(0.5, 0.5, 0.2, Math.PI / 6), 1000, 1000)!.angle).toBeCloseTo(Math.PI / 6));
  it("orders eyes by x regardless of landmark order (mirror-safe)", () => {
    const lm = synthetic(0.5, 0.5, 0.2, 0); [lm[LM.eyeOuterA], lm[LM.eyeOuterB]] = [lm[LM.eyeOuterB], lm[LM.eyeOuterA]];
    const f = faceFrame(lm, 100, 100)!; expect(f.eyeL.x).toBeLessThan(f.eyeR.x); expect(f.angle).toBeCloseTo(0);
  });
  it("returns null when landmarks are missing; filters tiny faces", () => {
    expect(faceFrame([], 100, 100)).toBeNull();
    expect(usableFace(faceFrame(synthetic(0.5, 0.5, 0.02, 0), 1000, 1000)!, 1000, 1000)).toBe(false);
    expect(usableFace(faceFrame(synthetic(0.5, 0.5, 0.2, 0), 1000, 1000)!, 1000, 1000)).toBe(true);
  });
});
describe("similarity (face swap alignment)", () => {
  it("maps the source eye centre onto the target's and matches scale/rotation", () => {
    const s = faceFrame(synthetic(0.3, 0.3, 0.1, 0), 1000, 1000)!, d = faceFrame(synthetic(0.6, 0.5, 0.2, 0.3), 1000, 1000)!; const t = similarity(s, d);
    expect(t.scale).toBeCloseTo(2); expect(t.rot).toBeCloseTo(0.3);
    const x = (Math.cos(t.rot) * s.center.x - Math.sin(t.rot) * s.center.y) * t.scale + t.tx, y = (Math.sin(t.rot) * s.center.x + Math.cos(t.rot) * s.center.y) * t.scale + t.ty;
    expect(x).toBeCloseTo(d.center.x); expect(y).toBeCloseTo(d.center.y);
  });
});

import { monotonicTs } from "./vision";
describe("detector timestamps", () => {
  it("strictly increase even when callers pass equal or earlier times", () => {
    const a = monotonicTs(1000), b = monotonicTs(1000), c = monotonicTs(500), d = monotonicTs(5000);
    expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b); expect(d).toBe(5000);
  });
});
