"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, signedUrl } from "@/lib/data";
import { EMOJI, rankStickers, searchEmoji, type StickerLite } from "@/lib/stickers/logic";
import { useVisible } from "@/modules/media/useVisible";

export interface Sticker extends StickerLite { pack_id: string; media_path: string; animated: boolean; consent: string; owner_id: string }
interface Pack { id: string; name: string; owner_id: string; conversation_id: string | null }
interface Gif { id: string; url: string; preview: string }
type Tab = "recent" | "favorites" | "emoji" | "gifs" | string; // string = pack id

function StickerImg({ s, onPick, onFav, fav }: { s: Sticker; onPick: () => void; onFav: () => void; fav: boolean }) {
  const [ref, seen] = useVisible<HTMLDivElement>(); const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (seen) signedUrl(s.media_path).then(setUrl); }, [seen, s.media_path]);
  return (
    <div ref={ref} style={{ position: "relative", aspectRatio: "1" }}>
      <button onClick={onPick} aria-label={`Send sticker ${s.name ?? ""}`} style={{ width: "100%", height: "100%", border: 0, background: "none", cursor: "pointer", padding: 2 }}>{url && <img src={url} alt={s.name ?? "Sticker"} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}</button>
      <button onClick={onFav} aria-pressed={fav} aria-label={fav ? "Remove from favorites" : "Add to favorites"} style={{ position: "absolute", top: 0, right: 0, border: 0, background: "none", cursor: "pointer", fontSize: ".9rem" }}>{fav ? "★" : "☆"}</button>
    </div>);
}

/** Recent, favorites, packs (own + shared + this chat's friend-group pack), emoji and GIFs. All sticker data is RLS-scoped. */
export function StickerPicker({ conversationId, onSticker, onEmoji, onGif, onClose }: { conversationId?: string; onSticker: (s: Sticker) => void; onEmoji: (e: string) => void; onGif: (g: Gif) => void; onClose: () => void }) {
  const [packs, setPacks] = useState<Pack[]>([]); const [stickers, setStickers] = useState<Sticker[]>([]); const [favs, setFavs] = useState<Set<string>>(new Set()); const [recents, setRecents] = useState<Map<string, number>>(new Map());
  const [tab, setTab] = useState<Tab>("recent"); const [q, setQ] = useState(""); const [gifs, setGifs] = useState<Gif[] | null>(null); const [gifState, setGifState] = useState<"idle" | "loading" | "unconfigured" | "error">("idle");

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: p }, { data: s }, { data: f }, { data: r }] = await Promise.all([
      sb.from("sticker_packs").select("*"), sb.from("stickers").select("*").in("consent", ["self", "approved"]), sb.from("sticker_favorites").select("sticker_id"), sb.from("sticker_recents").select("sticker_id,used_at").order("used_at", { ascending: false }).limit(30),
    ]);
    setPacks((p as Pack[]) ?? []); setStickers((s as Sticker[]) ?? []); setFavs(new Set((f ?? []).map((x) => x.sticker_id))); setRecents(new Map((r ?? []).map((x) => [x.sticker_id, Date.parse(x.used_at)])));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== "gifs") return; setGifState("loading"); const t = setTimeout(async () => {
      const r = await api<{ configured: boolean; gifs: Gif[] }>(`/api/gifs?q=${encodeURIComponent(q)}`, "GET");
      if (r.error) return setGifState("error"); if (!r.configured) return setGifState("unconfigured"); setGifs(r.gifs); setGifState("idle");
    }, 300); return () => clearTimeout(t);
  }, [tab, q]);

  async function toggleFav(s: Sticker) {
    const sb = supabase(); const on = favs.has(s.id);
    if (on) await sb.from("sticker_favorites").delete().match({ sticker_id: s.id }); else await sb.from("sticker_favorites").insert({ sticker_id: s.id, user_id: (await sb.auth.getUser()).data.user!.id });
    setFavs((x) => { const n = new Set(x); if (on) n.delete(s.id); else n.add(s.id); return n; });
  }
  const shown = useMemo(() => {
    const base = tab === "recent" ? stickers.filter((s) => recents.has(s.id)).sort((a, b) => (recents.get(b.id) ?? 0) - (recents.get(a.id) ?? 0)) : tab === "favorites" ? stickers.filter((s) => favs.has(s.id)) : stickers.filter((s) => s.pack_id === tab);
    return q ? rankStickers(q, (q && (tab === "recent" || tab === "favorites") ? stickers : base) as Sticker[], favs, recents) as Sticker[] : base;
  }, [tab, q, stickers, favs, recents]);
  const emoji = q ? searchEmoji(q) : [];
  const tabBtn = (k: Tab, l: string) => <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? "" : "ghost"}`} style={{ padding: ".25em .7em", whiteSpace: "nowrap" }} onClick={() => setTab(k)}>{l}</button>;

  return (
    <div className="glass card" style={{ display: "grid", gap: 8 }} aria-label="Stickers and emoji">
      <div className="row" style={{ justifyContent: "space-between" }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stickers, emoji, GIFs…" aria-label="Search stickers" style={{ flex: 1 }} /><button className="btn ghost" onClick={onClose} aria-label="Close stickers">✕</button></div>
      <div className="row" role="tablist" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
        {tabBtn("recent", "🕘 Recent")}{tabBtn("favorites", "★ Favorites")}{tabBtn("emoji", "😀 Emoji")}{tabBtn("gifs", "GIF")}
        {packs.map((p) => tabBtn(p.id, `${p.conversation_id ? "👥 " : ""}${p.name}`))}
      </div>
      <div style={{ maxHeight: 220, overflow: "auto" }}>
        {tab === "emoji" ? (
          (q ? [["Results", emoji] as [string, string[]]] : Object.entries(EMOJI)).map(([cat, list]) => <div key={cat}><div className="muted" style={{ fontSize: ".75rem" }}>{cat}</div><div className="row" style={{ gap: 2 }}>{list.map((e) => <button key={e} className="btn ghost" style={{ padding: ".1em .35em", fontSize: "1.4rem" }} onClick={() => onEmoji(e)} aria-label={`Send ${e}`}>{e}</button>)}</div></div>)
        ) : tab === "gifs" ? (
          gifState === "unconfigured" ? <p className="muted">GIF search isn't set up on this server yet (needs a Tenor or Giphy API key).</p> : gifState === "error" ? <p className="muted">Couldn't load GIFs.</p> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 4 }}>{gifState === "loading" && !gifs ? <div className="skeleton" style={{ height: 80 }} /> : gifs?.map((g) => <button key={g.id} onClick={() => onGif(g)} style={{ border: 0, padding: 0, background: "none", cursor: "pointer" }} aria-label="Send GIF"><img src={g.preview} alt="GIF" loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", borderRadius: 8 }} /></button>)}</div>
        ) : shown.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(72px,1fr))", gap: 4 }}>{shown.map((s) => <StickerImg key={s.id} s={s} fav={favs.has(s.id)} onFav={() => toggleFav(s)} onPick={() => onSticker(s)} />)}</div>
        ) : <p className="muted">{tab === "recent" ? "Stickers you use show up here." : tab === "favorites" ? "Tap ☆ on a sticker to keep it handy." : "No stickers found."} <a href="/stickers" style={{ textDecoration: "underline" }}>Make or manage stickers</a></p>}
      </div>
    </div>
  );
}
