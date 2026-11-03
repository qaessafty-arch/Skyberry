"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, useFriends, useMe } from "@/lib/data";

export default function Rooms() {
  const me = useMe(); const { friends } = useFriends(me);
  const [rooms, setRooms] = useState<{ id: string; title: string }[]>([]); const [title, setTitle] = useState(""); const [pick, setPick] = useState<string[]>([]); const [note, setNote] = useState("");
  const load = async () => { const { data } = await supabase().from("conversations").select("id,title").eq("kind", "group"); setRooms(data ?? []); };
  useEffect(() => { if (me) load(); }, [me]);
  const acc = friends?.filter((f) => f.status === "accepted") ?? [];
  async function create(e: React.FormEvent) { e.preventDefault(); const r = await api("/api/rooms", "POST", { title, members: pick }); setNote(r.error ? "Pick at least one friend." : "Room created 🏝️"); setTitle(""); setPick([]); load(); }
  return (<>
    <h1>🏝️ Rooms</h1>
    <form onSubmit={create} className="glass card" style={{ display: "grid", gap: 8 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Room name" required maxLength={40} aria-label="Room name" />
      <div className="row">{acc.map((f) => <label key={f.other.id} className="chip"><input type="checkbox" style={{ width: "auto" }} checked={pick.includes(f.other.id)} onChange={(e) => setPick(e.target.checked ? [...pick, f.other.id] : pick.filter((x) => x !== f.other.id))} />{f.other.display_name}</label>)}</div>
      <div className="row"><button className="btn" disabled={!pick.length}>Create room</button>{note && <span role="status" className="muted">{note}</span>}</div>
    </form>
    <div className="grid" style={{ marginTop: 14 }}>{rooms.map((r) => <div key={r.id} className="glass card"><b>{r.title}</b><div className="muted">Group chat room</div><div className="row" style={{ marginTop: 8 }}><Link className="btn" href={`/chats?c=${r.id}`}>Open</Link><Link className="btn ghost" href={`/rooms/${r.id}`}>⚙️ Manage</Link></div></div>)}</div>
    <p className="muted" style={{ marginTop: 14 }}>Live voice &amp; video in rooms is planned (needs a WebRTC/SFU provider) and isn't included yet.</p>
  </>);
}
