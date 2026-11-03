/** GIF hosts we are willing to render. Anything else is rejected server-side, so a crafted message can't make other users' browsers hit arbitrary URLs. */
const GIF_HOSTS = [/^media\d*\.giphy\.com$/, /^i\.giphy\.com$/, /^media\.tenor\.com$/, /^c\.tenor\.com$/];
export function validateGifUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 400) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && GIF_HOSTS.some((r) => r.test(u.hostname)) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,\s#]+/);
  return [...new Set(parts.map((t) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "")).filter((t) => t.length >= 2 && t.length <= 20))].slice(0, 10);
}

export interface StickerLite {
  id: string;
  name: string | null;
  tags: string[];
  created_at: string;
}

/** Search ranking: exact tag > tag prefix > name contains; favorites and recents break ties. */
export function rankStickers(q: string, all: StickerLite[], favorites: Set<string>, recents: Map<string, number>): StickerLite[] {
  const needle = q.trim().toLowerCase();
  const score = (s: StickerLite) => {
    let sc = 0;
    if (needle) {
      if (s.tags.includes(needle)) sc += 100;
      else if (s.tags.some((t) => t.startsWith(needle))) sc += 60;
      else if ((s.name ?? "").toLowerCase().includes(needle)) sc += 40;
      else return -1;
    }
    return sc + (favorites.has(s.id) ? 10 : 0) + (recents.has(s.id) ? 5 : 0);
  };
  return all
    .map((s) => [s, score(s)] as const)
    .filter(([, sc]) => sc >= 0)
    .sort((a, b) => b[1] - a[1] || (recents.get(b[0].id) ?? 0) - (recents.get(a[0].id) ?? 0) || Date.parse(b[0].created_at) - Date.parse(a[0].created_at))
    .map(([s]) => s);
}

/** Who may approve a pending sticker: only the person pictured. */
export const canDecideConsent = (s: { subject_id: string | null; consent: string }, userId: string) => s.subject_id === userId && s.consent === "pending";

export const EMOJI: Record<string, string[]> = {
  Smileys: ["😀", "😂", "🥹", "😍", "😎", "🤪", "😴", "🥳", "😭", "🤔", "🙃", "😇", "🤯", "😬", "🫠", "🥲"],
  Ocean: ["🌊", "🐙", "🦈", "🐬", "🐳", "🐢", "🦀", "🐠", "🪼", "🦭", "🐚", "⚓", "🏝️", "🫧", "🏄", "🤿"],
  Hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🩵", "🖤", "🤍", "💖", "💞", "💕"],
  Hands: ["👍", "👏", "🙌", "🙏", "🤝", "✌️", "🤞", "👀", "💪", "🫶", "🤙", "👋"],
  Fun: ["🎉", "🔥", "✨", "⭐", "🎂", "🎁", "🍕", "🍦", "☕", "🎮", "🎵", "📸"],
};
export const searchEmoji = (q: string) => {
  const n = q.trim().toLowerCase();
  return n ? Object.entries(EMOJI).filter(([k]) => k.toLowerCase().includes(n)).flatMap(([, v]) => v) : [];
};
