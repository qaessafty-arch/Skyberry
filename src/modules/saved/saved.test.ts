import { describe, it, expect } from "vitest";
import { querySaved, normalizeUrl, type SavedRow } from "./filter";

const row = (o: Partial<SavedRow>): SavedRow => ({ id: "x", kind: "message", title: null, note: null, url: null, media_path: null, collection_id: null, created_at: "2026-03-01T00:00:00Z", ...o });
const rows = [
  row({ id: "a", kind: "message", title: "dinner plan", created_at: "2026-03-01T00:00:00Z", message: { body: "see you at 8", deleted_at: null } }),
  row({ id: "b", kind: "link", url: "https://example.com/recipe", note: "Grandma's recipe", collection_id: "c1", created_at: "2026-03-03T00:00:00Z" }),
  row({ id: "c", kind: "photo", media_path: "u/p.jpg", collection_id: "c1", created_at: "2026-03-02T00:00:00Z" }),
  row({ id: "d", kind: "message", message: { body: "secret", deleted_at: "2026-03-04T00:00:00Z" }, created_at: "2026-03-04T00:00:00Z" }),
];
const base = { text: "", kind: "all", collection: "all", sort: "newest" } as const;

describe("saved filtering", () => {
  it("sorts by date both ways", () => {
    expect(querySaved(rows, base).map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
    expect(querySaved(rows, { ...base, sort: "oldest" }).map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
  });
  it("filters by type and collection", () => {
    expect(querySaved(rows, { ...base, kind: "photo" }).map((r) => r.id)).toEqual(["c"]);
    expect(querySaved(rows, { ...base, collection: "c1" }).map((r) => r.id)).toEqual(["b", "c"]);
    expect(querySaved(rows, { ...base, collection: "none" }).map((r) => r.id)).toEqual(["d", "a"]);
  });
  it("searches title, note, url and live message text — but never deleted message text", () => {
    expect(querySaved(rows, { ...base, text: "RECIPE" }).map((r) => r.id)).toEqual(["b"]);
    expect(querySaved(rows, { ...base, text: "at 8" }).map((r) => r.id)).toEqual(["a"]);
    expect(querySaved(rows, { ...base, text: "secret" })).toEqual([]);
  });
});

describe("link normalisation", () => {
  it("accepts http(s), adds https, rejects other schemes", () => {
    expect(normalizeUrl("example.com/a")).toBe("https://example.com/a");
    expect(normalizeUrl("http://x.org")).toBe("http://x.org/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,hi")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });
});
