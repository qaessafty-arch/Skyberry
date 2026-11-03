import { authed } from "@/modules/progression/http";
import { limit } from "@/modules/notify/service";
import { validateGifUrl } from "@/lib/stickers/logic";

interface Gif { id: string; url: string; preview: string; w: number; h: number }

/**
 * GIF search proxy. The API key stays on the server. Configure ONE of: TENOR_API_KEY, GIPHY_API_KEY.
 * Results are filtered through the same host allowlist the message API enforces.
 */
export const GET = (req: Request) => authed(async ({ user }) => {
  limit("gif", user.id, 30);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const tenor = process.env.TENOR_API_KEY, giphy = process.env.GIPHY_API_KEY;
  if (!tenor && !giphy) return { configured: false, gifs: [] as Gif[] };
  let gifs: Gif[] = [];
  if (tenor) {
    const u = new URL(q ? "https://tenor.googleapis.com/v2/search" : "https://tenor.googleapis.com/v2/featured");
    u.search = new URLSearchParams({ key: tenor, client_key: "ocean", limit: "24", media_filter: "gif,tinygif", contentfilter: "medium", ...(q ? { q } : {}) }).toString();
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error("upstream");
    const j = (await r.json()) as { results: { id: string; media_formats: Record<string, { url: string; dims: [number, number] }> }[] };
    gifs = j.results.map((x) => ({ id: x.id, url: x.media_formats.gif?.url, preview: x.media_formats.tinygif?.url, w: x.media_formats.gif?.dims[0], h: x.media_formats.gif?.dims[1] }));
  } else {
    const u = new URL(q ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending");
    u.search = new URLSearchParams({ api_key: giphy!, limit: "24", rating: "pg-13", ...(q ? { q } : {}) }).toString();
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error("upstream");
    const j = (await r.json()) as { data: { id: string; images: Record<string, { url: string; width: string; height: string }> }[] };
    gifs = j.data.map((x) => ({ id: x.id, url: x.images.fixed_height?.url, preview: x.images.fixed_height_small?.url ?? x.images.fixed_height?.url, w: +x.images.fixed_height?.width, h: +x.images.fixed_height?.height }));
  }
  return { configured: true, gifs: gifs.filter((g) => validateGifUrl(g.url) && validateGifUrl(g.preview)) };
});
