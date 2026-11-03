"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useMe } from "@/lib/data";

interface N { id: string; kind: string; payload: Record<string, string>; read_at: string | null; created_at: string }
const LABEL: Record<string, (p: Record<string, string>) => [string, string]> = {
  message: (p) => [`💬 New message${p.from ? ` from ${p.from}` : ""}`, p.conversationId ? `/chats?c=${p.conversationId}` : "/chats"],
  mention: (p) => [`@ ${p.from ?? "Someone"} mentioned you`, p.conversationId ? `/chats?c=${p.conversationId}` : "/chats"],
  friend_request: () => ["🫧 Friend request", "/friends"], group_invite: () => ["🏝️ Group invitation", "/rooms"], room_invite: () => ["🏝️ Room invitation", "/rooms"],
  sticker_request: () => ["🖼️ A friend wants to make a sticker of you — approve or decline", "/stickers"], call: (p) => [`📞 ${p.from ?? "Someone"} started a call`, p.conversationId ? `/rooms/${p.conversationId}/call` : "/rooms"],
  reaction: (p) => [`${p.emoji ?? "❤️"} Someone reacted to your moment`, "/moments"], moment: () => ["✨ New moment from a friend", "/moments"], missed_call: () => ["📞 Missed call", "/rooms"],
};

export default function Notifications() {
  const me = useMe(); const [items, setItems] = useState<N[] | null>(null); const [perm, setPerm] = useState<string>("default");
  const load = useCallback(async () => { const { data } = await supabase().from("notifications").select("*").order("created_at", { ascending: false }).limit(100); setItems((data as N[]) ?? []); }, []);
  useEffect(() => {
    if (!me) return; load(); setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const sb = supabase(); const ch = sb.channel("notifs").on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, (p) => {
      setItems((x) => [p.new as N, ...(x ?? [])]);
      // Foreground browser notification (Web Notifications API). True background push needs a service worker + VAPID keys: see docs/SETUP.md.
      const n = p.new as N; if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification(LABEL[n.kind]?.(n.payload)[0] ?? "OCEAN");
    }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [me, load]);
  const markAll = async () => { await supabase().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); load(); };
  return (<>
    <h1>🔔 Notifications</h1>
    <div className="row"><button className="btn ghost" onClick={markAll}>Mark all read</button>
      {perm === "default" && <button className="btn" onClick={async () => setPerm(await Notification.requestPermission())}>Enable browser notifications</button>}
      {perm === "denied" && <span className="muted">Browser notifications are blocked in your browser settings.</span>}</div>
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      {items === null && <div className="skeleton" style={{ height: 50 }} />}
      {items?.map((n) => { const [t, href] = (LABEL[n.kind] ?? (() => [n.kind, "/chats"]))(n.payload ?? {}); return (
        <Link key={n.id} href={href} onClick={() => supabase().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id)} className="glass card" style={{ opacity: n.read_at ? 0.6 : 1 }}>
          <b>{t}</b> <span className="muted">{new Date(n.created_at).toLocaleString()}</span></Link>); })}
      {items?.length === 0 && <p className="muted">All caught up 🌊</p>}
    </div></>);
}
