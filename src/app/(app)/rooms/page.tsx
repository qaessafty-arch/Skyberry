"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, useFriends, useMe } from "@/lib/data";

const TYPES = [["text", "💬", "Text room"], ["voice", "🎙️", "Voice room"], ["video", "🎥", "Video room"], ["daily", "☀️", "Daily life"], ["gaming", "🎮", "Gaming"], ["music", "🎵", "Music"], ["study", "📚", "Study"], ["meme", "😂", "Memes"], ["temporary", "⏳", "Temporary"], ["private", "🔒", "Private friends"]] as const;
const typeInfo = (t: string) => TYPES.find((x) => x[0] === t) ?? TYPES[0];

export default function Rooms() {
  const me = useMe(); const { friends } = useFriends(me);
  const [rooms, setRooms] = useState<{ id: string; title: string; room_type: string; expires_at: string | null }[]>([]); const [type, setType] = useState("text"); const [hours, setHours] = useState(24); const [title, setTitle] = useState(""); const [pick, setPick] = useState<string[]>([]); const [note, setNote] = useState("");
  const load = async () => { const { data } = await supabase().from("conversations").select("id,title,room_type,expires_at").eq("kind", "group").or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`); setRooms(data ?? []); };
  useEffect(() => { if (me) load(); }, [me]);
  const acc = friends?.filter((f) => f.status === "accepted") ?? [];
  async function create(e: React.FormEvent) { e.preventDefault(); const r = await api("/api/rooms", "POST", { title, members: pick, roomType: type, hours: type === "temporary" ? hours : undefined }); setNote(r.error ? "Pick at least one friend." : "Room created 🏝️"); setTitle(""); setPick([]); load(); }
  return (<>
    <h1>🏝️ Rooms</h1>
    <form onSubmit={create} className="glass card" style={{ display: "grid", gap: 8 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Room name" required maxLength={40} aria-label="Room name" />
      <div className="row"><select aria-label="Room type" value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto" }}>{TYPES.map(([k, i, l]) => <option key={k} value={k}>{i} {l}</option>)}</select>{type === "temporary" && <label className="chip">Lasts <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(+e.target.value)} style={{ width: 64 }} aria-label="Hours" /> h</label>}</div>
      <div className="row">{acc.map((f) => <label key={f.other.id} className="chip"><input type="checkbox" style={{ width: "auto" }} checked={pick.includes(f.other.id)} onChange={(e) => setPick(e.target.checked ? [...pick, f.other.id] : pick.filter((x) => x !== f.other.id))} />{f.other.display_name}</label>)}</div>
      <div className="row"><button className="btn" disabled={!pick.length}>Create room</button>{note && <span role="status" className="muted">{note}</span>}</div>
    </form>
    <div className="grid" style={{ marginTop: 14 }}>{rooms.map((r) => <div key={r.id} className="glass card"><b>{typeInfo(r.room_type)[1]} {r.title}</b><div className="muted">{typeInfo(r.room_type)[2]}{r.expires_at ? ` · ends ${new Date(r.expires_at).toLocaleString()}` : ""}</div><div className="row" style={{ marginTop: 8 }}><Link className="btn" href={`/chats?c=${r.id}`}>Open</Link>{["voice", "video", "daily", "gaming", "music", "study"].includes(r.room_type) && <Link className="btn" href={`/rooms/${r.id}/call?mode=${["video", "daily"].includes(r.room_type) ? "video" : "audio"}`}>{["video", "daily"].includes(r.room_type) ? "🎥 Join" : "🎙️ Join"}</Link>}<Link className="btn ghost" href={`/rooms/${r.id}`}>⚙️ Manage</Link></div></div>)}</div>
    <p className="muted" style={{ marginTop: 14 }}>Calls are peer-to-peer WebRTC (up to 6 people). Strict networks may need a TURN server — see the setup guide.</p>
  </>);
}
