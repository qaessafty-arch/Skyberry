export type SavedKind = "message" | "photo" | "video" | "file" | "sticker" | "voice" | "link" | "memory";
export interface SavedRow { id: string; kind: SavedKind; title: string | null; note: string | null; url: string | null; media_path: string | null; collection_id: string | null; created_at: string; message?: { body: string | null; deleted_at: string | null } | null }
export interface SavedQuery { text: string; kind: SavedKind | "all"; collection: string | "all" | "none"; sort: "newest" | "oldest" }

/** Client-side filter/sort over the user's own saved rows (their RLS-scoped set). Search covers title, note, link and message text. */
export function querySaved<T extends SavedRow>(rows: T[], q: SavedQuery): T[] {
  const needle = q.text.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (q.kind !== "all" && r.kind !== q.kind) return false;
    if (q.collection === "none" ? r.collection_id !== null : q.collection !== "all" && r.collection_id !== q.collection) return false;
    if (!needle) return true;
    return [r.title, r.note, r.url, r.message?.deleted_at ? null : r.message?.body].some((f) => f?.toLowerCase().includes(needle));
  });
  return out.sort((a, b) => (q.sort === "newest" ? Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(a.created_at) - Date.parse(b.created_at)));
}

/** Only http(s) URLs may be saved as links, so a saved "link" can never be a javascript: URL. */
export function normalizeUrl(input: string): string | null {
  const t = input.trim(); if (!t) return null;
  try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

export const KIND_LABEL: Record<SavedKind | "all", string> = { all: "All", message: "Messages", photo: "Photos", video: "Videos", file: "Files", sticker: "Stickers", voice: "Voice", link: "Links", memory: "Memories" };
