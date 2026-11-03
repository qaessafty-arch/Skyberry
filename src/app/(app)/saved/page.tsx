"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { Media } from "@/modules/social/Media";

export default function Saved() {
  const [items, setItems] = useState<{ id: string; title: string | null; media_path: string | null; created_at: string }[]>([]);
  const load = async () => { const { data } = await supabase().from("memories").select("*").order("created_at", { ascending: false }); setItems(data ?? []); };
  useEffect(() => { load(); }, []);
  return (<><h1>💾 Saved memories</h1>
    <div className="grid">{items.map((m) => <div key={m.id} className="glass card">{m.media_path && <Media path={m.media_path} alt={m.title ?? "Memory"} />}<div className="row" style={{ marginTop: 8 }}><span className="muted">{m.title}</span><button className="btn ghost" onClick={async () => { await supabase().from("memories").delete().eq("id", m.id); load(); }}>Remove</button></div></div>)}</div>
    {!items.length && <p className="muted">Photos you save from the camera or chats land here. Only you can see them.</p>}</>);
}
