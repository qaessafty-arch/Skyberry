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

import { recordingPlan, videoLabel, pickVideoMime } from "./recorder";
describe("video recording plan (honest labels)", () => {
  it("raw stream keeps native size and its true label", () => {
    expect(recordingPlan({ effects: false, aspectMatchesSensor: true, sensor: { w: 3840, h: 2160 }, aspect: 16 / 9 })).toMatchObject({ source: "stream", width: 3840, height: 2160, label: "4K" });
    expect(recordingPlan({ effects: false, aspectMatchesSensor: true, sensor: { w: 1280, h: 720 }, aspect: 16 / 9 }).label).toBe("720p");
  });
  it("effects force canvas compositing, capped — so a 4K sensor is NOT labelled 4K", () => {
    const p = recordingPlan({ effects: true, aspectMatchesSensor: true, sensor: { w: 3840, h: 2160 }, aspect: 16 / 9 });
    expect(p.source).toBe("canvas"); expect(p.width).toBe(1280); expect(p.label).toBe("720p"); expect(p.width % 2 + p.height % 2).toBe(0);
  });
  it("a non-sensor aspect uses the canvas at up to 1080p and never exceeds the sensor", () => {
    const p = recordingPlan({ effects: false, aspectMatchesSensor: false, sensor: { w: 1280, h: 720 }, aspect: 9 / 16 });
    expect(p.source).toBe("canvas"); expect(p.width).toBeLessThan(p.height);
    expect(p.height).toBeLessThanOrEqual(720); expect(p.width).toBeLessThanOrEqual(405); // 9:16 crop of a 1280×720 sensor is 405×720 — no upscaling
  });
  it("labels and mime choice", () => { expect(videoLabel(1920, 1080)).toBe("1080p"); expect(videoLabel(1080, 1920)).toBe("1080p"); expect(videoLabel(640, 480)).toBe("SD"); expect(pickVideoMime((t) => t === "video/mp4")?.ext).toBe("mp4"); expect(pickVideoMime(() => false)).toBeNull(); });
});

describe("recording plan never upscales", () => {
  it("zoom shrinks the available region", () => {
    const p = recordingPlan({ effects: true, aspectMatchesSensor: true, sensor: { w: 1280, h: 720 }, aspect: 16 / 9, zoom: 2 });
    expect(p.width).toBeLessThanOrEqual(640); expect(p.height).toBeLessThanOrEqual(360);
  });
  it("uses the stream only when untouched", () => expect(recordingPlan({ effects: false, aspectMatchesSensor: true, sensor: { w: 1280, h: 720 }, aspect: 16 / 9, zoom: 1.5 }).source).toBe("canvas"));
});

describe("chat style: background image paths", () => {
  const uid = "00000000-0000-0000-0000-00000000000a";
  it("accepts only own-folder storage paths", () => {
    expect(sanitizeStyle({ bg: "image", bgPath: `${uid}/bg-1.webp` }).bgPath).toBe(`${uid}/bg-1.webp`);
    for (const bad of ["../x", "https://evil.com/a.png", `${uid}/../../etc`, "javascript:alert(1)", "a/b"]) expect(sanitizeStyle({ bg: "image", bgPath: bad as never }).bgPath).toBeNull();
  });
  it("clamps dim/blur", () => { const s = sanitizeStyle({ bgBlur: 999, bgDim: 5 }); expect(s.bgBlur).toBe(20); expect(s.bgDim).toBe(0.8); });
});

import { rng } from "../social/generateBackground";
describe("seeded generator", () => {
  it("is deterministic per seed and varies across seeds", () => { const a = rng(7), b = rng(7), c = rng(8); const A = [a(), a(), a()], B = [b(), b(), b()]; expect(A).toEqual(B); expect(c()).not.toBe(A[0]); for (const v of A) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); } });
});
