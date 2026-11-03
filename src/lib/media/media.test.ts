import { describe, it, expect } from "vitest";
import { formatBytes, safeDisplayName, optimizeTarget, nextToStart, overallProgress, type QueueItem } from "./helpers";

describe("formatBytes", () => {
  it("formats across units", () => { expect(formatBytes(0)).toBe("0 B"); expect(formatBytes(1536)).toBe("1.5 KB"); expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB"); expect(formatBytes(-1)).toBe("—"); });
});
describe("safeDisplayName", () => {
  it("drops paths and control characters", () => {
    expect(safeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayName("C:\\Users\\me\\cat.png")).toBe("cat.png");
    expect(safeDisplayName("a\u0000b<script>.jpg")).toBe("abscript.jpg");
    expect(safeDisplayName("///")).toBe("file");
  });
});
describe("optimizeTarget", () => {
  it("never touches originals, gifs or small images", () => {
    expect(optimizeTarget({ type: "image/jpeg", size: 9e6 }, { w: 6000, h: 4000 }, true)).toBeNull();
    expect(optimizeTarget({ type: "image/gif", size: 9e6 }, { w: 6000, h: 4000 }, false)).toBeNull();
    expect(optimizeTarget({ type: "image/jpeg", size: 2e5 }, { w: 1200, h: 800 }, false)).toBeNull();
  });
  it("downsizes huge images and re-encodes heavy ones", () => {
    expect(optimizeTarget({ type: "image/jpeg", size: 9e6 }, { w: 6000, h: 4000 }, false)).toBe(2560);
    expect(optimizeTarget({ type: "image/png", size: 8e6 }, { w: 2000, h: 1500 }, false)).toBe(2000);
  });
});
describe("upload queue", () => {
  const it_ = (id: string, status: QueueItem["status"], progress = 0, size = 100): QueueItem => ({ id, name: id, size, progress, status });
  it("respects concurrency and order", () => {
    expect(nextToStart([it_("a", "uploading"), it_("b", "uploading"), it_("c", "queued")])).toBeNull();
    expect(nextToStart([it_("a", "uploading"), it_("b", "queued"), it_("c", "queued")])?.id).toBe("b");
    expect(nextToStart([it_("a", "done"), it_("b", "error")])).toBeNull();
  });
  it("computes size-weighted progress ignoring canceled", () => {
    expect(overallProgress([it_("a", "done", 100, 100), it_("b", "uploading", 50, 100)])).toBe(75);
    expect(overallProgress([it_("a", "canceled", 0, 500), it_("b", "done", 100, 100)])).toBe(100);
    expect(overallProgress([])).toBe(0);
  });
});

import { swipeDirection } from "../useSwipe";
import { pickAudioMime } from "../../modules/media/VoiceRecorder";
describe("swipe", () => {
  it("needs distance and horizontal intent", () => {
    expect(swipeDirection(-100, 10)).toBe("left"); expect(swipeDirection(100, -20)).toBe("right");
    expect(swipeDirection(30, 0)).toBeNull(); expect(swipeDirection(100, 90)).toBeNull();
  });
});
describe("recorder format", () => {
  it("prefers webm/opus, falls back to mp4 (Safari), else null", () => {
    expect(pickAudioMime(() => true)?.ext).toBe("webm");
    expect(pickAudioMime((t) => t === "audio/mp4")).toEqual({ mime: "audio/mp4", ext: "m4a" });
    expect(pickAudioMime(() => false)).toBeNull();
  });
});

import { isCorrect, pick, TRIVIA } from "../../modules/social/games";
describe("games", () => {
  it("scores trivia defensively and picks deterministically with a supplied rng", () => {
    expect(isCorrect({ answer: 2 }, 2)).toBe(true); expect(isCorrect({ answer: 2 }, 1)).toBe(false); expect(isCorrect({}, 0)).toBe(false); expect(isCorrect({ answer: "2" as never }, 2)).toBe(false);
    expect(pick(["a", "b", "c"], () => 0.99)).toBe("c");
    for (const t of TRIVIA) { expect(t.answer).toBeGreaterThanOrEqual(0); expect(t.answer).toBeLessThan(t.options.length); }
  });
});

import { readWithProgress } from "../../modules/media/download";
describe("download progress", () => {
  it("reports increasing progress and returns the full body", async () => {
    const chunks = [new Uint8Array(400), new Uint8Array(400), new Uint8Array(200)];
    const body = new ReadableStream({ start(c) { chunks.forEach((x) => c.enqueue(x)); c.close(); } });
    const seen: number[] = [];
    const blob = await readWithProgress(new Response(body, { headers: { "content-length": "1000", "content-type": "application/pdf" } }), (p) => seen.push(p));
    expect(blob.size).toBe(1000); expect(blob.type).toBe("application/pdf");
    expect(seen).toEqual([40, 80, 99, 100]);
  });
  it("reports -1 when the size is unknown", async () => {
    const seen: number[] = [];
    await readWithProgress(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); c.close(); } })), (p) => seen.push(p));
    expect(seen[0]).toBe(-1); expect(seen.at(-1)).toBe(100);
  });
});
