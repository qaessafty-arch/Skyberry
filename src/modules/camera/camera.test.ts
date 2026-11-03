import { describe, it, expect } from "vitest";
import { cropFor, guidance, groupFraming, ASPECTS, goldenLines } from "./compose";
import { warpImage } from "./warp";

describe("composition", () => {
  it("crops to the requested aspect and stays in bounds", () => {
    const c = cropFor(4000, 3000, ASPECTS["9:16"], { x: 0.95, y: 0.5 });
    expect(c.w / c.h).toBeCloseTo(9 / 16, 3);
    expect(c.x + c.w).toBeLessThanOrEqual(4000);
    expect(c.x).toBeGreaterThanOrEqual(0);
  });
  it("zoom shrinks the crop", () => expect(cropFor(1000, 1000, 1, undefined, 2).w).toBe(500));
  it("guides small and large faces", () => {
    const f = { w: 1000, h: 1000 };
    expect(guidance({ x: 450, y: 100, width: 60, height: 100 }, f)).toMatch(/closer/);
    expect(guidance({ x: 100, y: 100, width: 500, height: 700 }, f)).toMatch(/Step back/);
    expect(guidance(null, f)).toMatch(/Looking/);
  });
  it("flags group members at the frame edge", () => {
    expect(groupFraming([{ x: 5, y: 100, width: 80, height: 80 }, { x: 500, y: 100, width: 80, height: 80 }], { w: 1000, h: 800 }).advice).toMatch(/edge/);
    expect(goldenLines(100)).toEqual([38.2, 61.8]);
  });
});

describe("warp", () => {
  const img = () => { const d = { width: 16, height: 16, data: new Uint8ClampedArray(1024) }; for (let i = 0; i < 256; i++) { d.data[i * 4] = i; d.data[i * 4 + 3] = 255; } return d; };
  it("is the identity at strength 0", () => expect(Array.from(warpImage(img(), 8, 8, 7, 0).data)).toEqual(Array.from(img().data)));
  it("changes pixels inside the radius only", () => {
    const a = img(), b = warpImage(a, 8, 8, 7, 0.9);
    expect(b.data[(0 * 8 + 0) * 4]).toBe(a.data[0]);
    expect(Array.from(b.data)).not.toEqual(Array.from(a.data));
  });
});

import { applyAdjust, NEUTRAL, qualityLabel, hist, commit, undo, redo } from "./adjust";
describe("adjustments", () => {
  const px = (r: number, g: number, b: number) => ({ width: 1, height: 1, data: new Uint8ClampedArray([r, g, b, 255]) });
  it("neutral is a no-op", () => expect(applyAdjust(px(10, 20, 30), NEUTRAL).data[0]).toBe(10));
  it("brightness raises, contrast spreads, saturation 0 → grey", () => {
    expect(applyAdjust(px(100, 100, 100), { ...NEUTRAL, brightness: 0.5 }).data[0]).toBeGreaterThan(100);
    expect(applyAdjust(px(200, 200, 200), { ...NEUTRAL, contrast: 0.5 }).data[0]).toBeGreaterThan(200);
    const g = applyAdjust(px(255, 0, 0), { ...NEUTRAL, saturation: -1 }).data;
    expect(g[0]).toBe(g[1]); expect(g[1]).toBe(g[2]);
  });
  it("shadows lift only dark pixels; highlights lower only bright ones", () => {
    expect(applyAdjust(px(30, 30, 30), { ...NEUTRAL, shadows: 1 }).data[0]).toBeGreaterThan(30);
    expect(applyAdjust(px(240, 240, 240), { ...NEUTRAL, shadows: 1 }).data[0]).toBe(240);
    expect(applyAdjust(px(240, 240, 240), { ...NEUTRAL, highlights: -1 }).data[0]).toBeLessThan(240);
  });
  it("stays within 0..255", () => expect(applyAdjust(px(250, 250, 250), { ...NEUTRAL, brightness: 1, contrast: 1 }).data[0]).toBe(255));
});
describe("honest quality label", () => {
  it("labels by real pixels only", () => {
    expect(qualityLabel(3840, 2160)).toBe("4K"); expect(qualityLabel(2160, 3840)).toBe("4K");
    expect(qualityLabel(1920, 1080)).toBe("1080p"); expect(qualityLabel(1280, 720)).toBe("HD"); expect(qualityLabel(640, 480)).toBe("SD");
    expect(qualityLabel(3000, 1500)).not.toBe("4K");
  });
});
describe("undo/redo", () => {
  it("round-trips and clears redo on new edits", () => {
    let h = hist(0); h = commit(h, 1); h = commit(h, 2);
    h = undo(h); expect(h.present).toBe(1); h = redo(h); expect(h.present).toBe(2);
    h = undo(h); h = commit(h, 9); expect(h.future).toEqual([]); expect(undo(undo(undo(h))).present).toBe(0);
  });
});

import { sanitizeStyle, DEFAULT_STYLE } from "../social/chatStyle";
describe("chat style sanitising", () => {
  it("falls back on garbage and clamps ranges", () => {
    expect(sanitizeStyle(null)).toEqual(DEFAULT_STYLE);
    const s = sanitizeStyle({ bubble: "red;background:url(x)" as never, font: 999, radius: -5, bg: "evil" as never });
    expect(s.bubble).toBe(DEFAULT_STYLE.bubble); expect(s.font).toBe(22); expect(s.radius).toBe(4); expect(s.bg).toBe("none");
  });
});
