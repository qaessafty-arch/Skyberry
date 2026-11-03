"use client";
import { useState } from "react";
import { api, useFriends, useMe } from "@/lib/data";

export default function Friends() {
  const me = useMe(); const { friends, reload } = useFriends(me);
  const [handle, setHandle] = useState(""); const [msg, setMsg] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault(); const r = await api("/api/friends", "POST", { handle: handle.trim().toLowerCase().replace(/^@/, "") });
    setMsg(r.error ? "Couldn't find that handle." : "Request sent 🫧"); setHandle(""); reload();
  }
  const accept = async (id: string) => { await api("/api/friends", "PUT", { friendshipId: id }); reload(); };
  return (<>
    <h1>🫧 Friends</h1>
    <form onSubmit={add} className="row glass card"><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Add by @handle" style={{ flex: 1 }} aria-label="Friend handle" /><button className="btn">Send request</button>{msg && <span className="muted" role="status">{msg}</span>}</form>
    <div className="grid" style={{ marginTop: 14 }}>
      {friends?.map((f) => (
        <div key={f.friendshipId} className="glass card">
          <b>{f.other.display_name}</b> <span className="muted">@{f.other.handle}</span>
          <div className="row" style={{ marginTop: 8 }}>
            {f.status === "accepted" ? <span className="chip">Friends 💙</span> : f.incoming ? <button className="btn" onClick={() => accept(f.friendshipId)}>Accept</button> : <span className="chip">Request sent</span>}
          </div>
        </div>))}
      {friends?.length === 0 && <p className="muted">No friends yet. Add someone by handle — your shared pet hatches when they accept.</p>}
    </div>
  </>);
}
