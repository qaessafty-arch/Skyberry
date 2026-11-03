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
