import { describe, it, expect } from "vitest";
import { validateGifUrl, normalizeTags, rankStickers, canDecideConsent, searchEmoji } from "./logic";

describe("gif url allowlist", () => {
  it("accepts https giphy/tenor only", () => {
    expect(validateGifUrl("https://media2.giphy.com/media/abc/giphy.gif")).toBeTruthy();
    expect(validateGifUrl("https://media.tenor.com/x/y.gif")).toBeTruthy();
    for (const bad of ["http://media.giphy.com/a.gif", "https://evil.com/a.gif", "https://media.giphy.com.evil.com/a.gif", "https://user:pw@media.giphy.com/a.gif", "javascript:alert(1)", "https://i.giphy.com@evil.com/a", 5, null]) {
      expect(validateGifUrl(bad)).toBeNull();
    }
  });
});

describe("tags", () => {
  it("normalises, dedupes and caps", () => {
    expect(normalizeTags("Funny, #LOL  funny!! a")).toEqual(["funny", "lol"]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `tag${i}`)).length).toBe(10);
  });
});

describe("sticker ranking", () => {
  const S = (id: string, name: string, tags: string[], d = "2026-01-01") => ({ id, name, tags, created_at: `${d}T00:00:00Z` });
  const all = [S("1", "Happy dance", ["happy", "dance"]), S("2", "Sad cat", ["sad", "cat"]), S("3", "Dancing crab", ["crab"], "2026-02-01")];
  it("exact tag beats name matches; non-matches drop", () => {
    expect(rankStickers("danc", all, new Set(), new Map()).map((s) => s.id)).toEqual(["1", "3"]);
    expect(rankStickers("zzz", all, new Set(), new Map())).toEqual([]);
  });
  it("favorites and recents order an empty query", () => {
    expect(rankStickers("", all, new Set(["2"]), new Map())[0].id).toBe("2");
    expect(rankStickers("", all, new Set(), new Map([["1", 999]]))[0].id).toBe("1");
  });
});

describe("consent + emoji", () => {
  it("only the pictured person can decide a pending sticker", () => {
    expect(canDecideConsent({ subject_id: "u", consent: "pending" }, "u")).toBe(true);
    expect(canDecideConsent({ subject_id: "u", consent: "pending" }, "x")).toBe(false);
    expect(canDecideConsent({ subject_id: "u", consent: "approved" }, "u")).toBe(false);
    expect(canDecideConsent({ subject_id: null, consent: "self" }, "u")).toBe(false);
  });
  it("emoji search by category", () => {
    expect(searchEmoji("ocean")).toContain("🐙");
    expect(searchEmoji("")).toEqual([]);
  });
});

import { squareCrop } from "../../modules/stickers/makeSticker";
describe("square crop", () => {
  it("crops the long axis and respects focus", () => {
    expect(squareCrop(400, 200)).toEqual({ x: 100, y: 0, size: 200 });
    expect(squareCrop(200, 400, 0)).toEqual({ x: 0, y: 0, size: 200 });
    expect(squareCrop(200, 400, 1)).toEqual({ x: 0, y: 200, size: 200 });
    expect(squareCrop(300, 300)).toEqual({ x: 0, y: 0, size: 300 });
  });
});
