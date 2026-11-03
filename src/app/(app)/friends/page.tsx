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
  const remove = async (id: string, label: string) => { if (!confirm(label)) return; await api("/api/friends", "DELETE", { friendshipId: id }); reload(); };
  const [invite, setInvite] = useState("");
  const makeInvite = async () => { const r = await api<{ code: string }>("/api/invites", "POST", {}); if (r.code) setInvite(`${location.origin}/invite/${r.code}`); };
  const accept = async (id: string) => { await api("/api/friends", "PUT", { friendshipId: id }); reload(); };
  return (<>
    <h1>🫧 Friends</h1>
    <form onSubmit={add} className="row glass card"><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Add by @handle" style={{ flex: 1 }} aria-label="Friend handle" /><button className="btn">Send request</button>{msg && <span className="muted" role="status">{msg}</span>}</form>
    <div className="glass card" style={{ marginTop: 12 }}><div className="row"><button className="btn ghost" onClick={makeInvite}>🔗 Create invite link</button><span className="muted">Single-use, expires in 7 days.</span></div>
      {invite && <div className="row" style={{ marginTop: 8 }}><input readOnly value={invite} onFocus={(e) => e.target.select()} aria-label="Invite link" style={{ flex: 1 }} /><button className="btn" onClick={() => navigator.clipboard?.writeText(invite)}>Copy</button></div>}</div>
    <div className="grid" style={{ marginTop: 14 }}>
      {friends?.map((f) => (
        <div key={f.friendshipId} className="glass card">
          <b>{f.other.display_name}</b> <span className="muted">@{f.other.handle}</span>
          <div className="row" style={{ marginTop: 8 }}>
            {f.status === "accepted" ? <><span className="chip">Friends 💙</span><button className="btn ghost" onClick={() => remove(f.friendshipId, `Remove ${f.other.display_name}? Your chat and shared pet will be deleted.`)}>Remove</button></> : f.incoming ? <><button className="btn" onClick={() => accept(f.friendshipId)}>Accept</button><button className="btn ghost" onClick={() => remove(f.friendshipId, "Decline this request?")}>Decline</button></> : <><span className="chip">Request sent</span><button className="btn ghost" onClick={() => remove(f.friendshipId, "Cancel request?")}>Cancel</button></>}
          </div>
        </div>))}
      {friends?.length === 0 && <p className="muted">No friends yet. Add someone by handle — your shared pet hatches when they accept.</p>}
    </div>
  </>);
}
