"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { api, uploadMedia, useFriends, useMe } from "@/lib/data";
import { can, ROLE_LABEL, type Role } from "@/lib/groups/permissions";
import { Media } from "@/modules/social/Media";

interface Group { id: string; title: string; description: string | null; announcement: string | null; avatar_path: string | null; only_admins_post: boolean }
interface Member { user_id: string; role: Role; name: string; handle: string }

/** Group admin: settings, members & roles, invites, leave/delete. Controls are hidden by `can()`, and the API re-checks every action. */
export default function GroupAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter(); const me = useMe(); const { friends } = useFriends(me);
  const [g, setG] = useState<Group | null>(null); const [members, setMembers] = useState<Member[]>([]); const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", announcement: "", onlyAdminsPost: false });
  const [note, setNote] = useState(""); const [invite, setInvite] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: c } = await sb.from("conversations").select("*").eq("id", id).eq("kind", "group").maybeSingle();
    if (!c) return setMissing(true);
    setG(c as Group); setForm({ title: c.title ?? "", description: c.description ?? "", announcement: c.announcement ?? "", onlyAdminsPost: c.only_admins_post });
    const { data: mem } = await sb.from("conversation_members").select("user_id,role").eq("conversation_id", id);
    const ids = (mem ?? []).map((m) => m.user_id);
    const { data: ps } = await sb.from("profiles").select("id,display_name,handle").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const rank = { owner: 0, admin: 1, member: 2 } as const;
    setMembers((mem ?? []).map((m) => { const p = ps?.find((x) => x.id === m.user_id); return { user_id: m.user_id, role: m.role as Role, name: p?.display_name ?? "Member", handle: p?.handle ?? "" }; }).sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name)));
  }, [id]);
  useEffect(() => { if (me) load(); }, [me, load]);

  const myRole = members.find((m) => m.user_id === me?.id)?.role;
  if (missing) return <div className="glass card"><h2>Group not found</h2><p className="muted">It may have been deleted, or you're no longer a member.</p><Link className="btn" href="/rooms">Back to rooms</Link></div>;
  if (!g || !myRole) return <div className="glass card skeleton" style={{ height: 200 }} aria-busy />;

  const act = async (body: Record<string, unknown>, ok: string) => { setBusy(true); const r = await api(`/api/groups/${id}`, "POST", body); setBusy(false); setNote(r.error ? "You can't do that." : ok); await load(); return r; };
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await api(`/api/groups/${id}`, "PATCH", { title: form.title.trim(), description: form.description, announcement: form.announcement, onlyAdminsPost: form.onlyAdminsPost });
    setBusy(false); setNote(r.error ? "Couldn't save." : "Saved ✓"); load();
  }
  async function avatar(f: File) { try { const path = await uploadMedia(f, f.name.split(".").pop() ?? "jpg"); await api(`/api/groups/${id}`, "PATCH", { avatarPath: path }); setNote("Picture updated"); load(); } catch { setNote("Upload failed"); } }
  async function makeInvite() { const r = await api<{ code: string }>("/api/invites", "POST", { conversationId: id, maxUses: 10, days: 7 }); if (r.code) setInvite(`${location.origin}/invite/${r.code}`); else setNote("Only admins can create invites."); }
  const addable = (friends ?? []).filter((f) => f.status === "accepted" && !members.some((m) => m.user_id === f.other.id));

  return (<>
    <div className="row" style={{ marginBottom: 8 }}><Link className="btn ghost" href={`/chats?c=${id}`}>← Open chat</Link><Link className="btn ghost" href="/rooms">All rooms</Link></div>
    <div className="glass card" style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 14, alignItems: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, overflow: "hidden", background: "var(--line)", display: "grid", placeItems: "center", fontSize: "2rem" }}>{g.avatar_path ? <Media path={g.avatar_path} alt="Group picture" style={{ height: 72, objectFit: "cover", borderRadius: 0 }} /> : "🏝️"}</div>
      <div><h1 style={{ margin: 0 }}>{g.title}</h1><div className="muted">{members.length} members · you are {ROLE_LABEL[myRole].toLowerCase()}</div>{g.description && <p>{g.description}</p>}</div>
    </div>
    {g.announcement && <div className="glass card" style={{ marginTop: 10 }} role="note">📣 <b>Announcement:</b> {g.announcement}</div>}
    {note && <p role="status" className="chip" style={{ marginTop: 10 }}>{note}</p>}

    {can(myRole, "editSettings") && (
      <form onSubmit={saveSettings} className="glass card" style={{ display: "grid", gap: 8, marginTop: 12, maxWidth: 620 }}>
        <h3>Group settings</h3>
        <label>Name<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={40} required /></label>
        <label>Description<textarea rows={2} value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>Announcement <span className="muted">(shown at the top of the chat)</span><textarea rows={2} value={form.announcement} maxLength={500} onChange={(e) => setForm({ ...form, announcement: e.target.value })} /></label>
        <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={form.onlyAdminsPost} onChange={(e) => setForm({ ...form, onlyAdminsPost: e.target.checked })} />Only admins can send messages</label>
        <div className="row"><label className="btn ghost" style={{ cursor: "pointer" }}>🖼️ Group picture<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && avatar(e.target.files[0])} /></label><button className="btn" disabled={busy}>Save settings</button></div>
      </form>)}

    <div className="glass card" style={{ marginTop: 12, maxWidth: 620 }}>
      <h3>Members</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {members.map((m) => { const mine = m.user_id === me?.id; return (
          <li key={m.user_id} className="row" style={{ justifyContent: "space-between" }}>
            <span><b>{m.name}</b> <span className="muted">@{m.handle}</span> <span className="chip">{ROLE_LABEL[m.role]}</span>{mine && <span className="chip">you</span>}</span>
            {!mine && <span className="row">
              {can(myRole, "setRole", m.role) && <button className="btn ghost" disabled={busy} onClick={() => act({ action: "setRole", userId: m.user_id, role: m.role === "admin" ? "member" : "admin" }, m.role === "admin" ? "Made member" : "Made admin")}>{m.role === "admin" ? "Remove admin" : "Make admin"}</button>}
              {can(myRole, "transferOwner", m.role) && <button className="btn ghost" disabled={busy} onClick={() => confirm(`Make ${m.name} the owner? You'll become an admin.`) && act({ action: "transfer", userId: m.user_id }, "Ownership transferred")}>Make owner</button>}
              {can(myRole, "removeMember", m.role) && <button className="btn ghost" disabled={busy} onClick={() => confirm(`Remove ${m.name} from the group?`) && act({ action: "remove", userId: m.user_id }, "Removed")}>Remove</button>}
            </span>}
          </li>); })}
      </ul>
    </div>

    {can(myRole, "addMember") && (
      <div className="glass card" style={{ marginTop: 12, maxWidth: 620 }}>
        <h3>Add people</h3>
        {addable.length ? <div className="row">{addable.map((f) => <button key={f.other.id} className="btn ghost" disabled={busy} onClick={() => act({ action: "add", userId: f.other.id }, `Added ${f.other.display_name}`)}>＋ {f.other.display_name}</button>)}</div> : <p className="muted">All your friends are already here.</p>}
        {can(myRole, "invite") && <div style={{ marginTop: 10 }}><button className="btn ghost" onClick={makeInvite}>🔗 Create invite link</button> <span className="muted">Up to 10 uses, expires in 7 days.</span>
          {invite && <div className="row" style={{ marginTop: 8 }}><input readOnly value={invite} onFocus={(e) => e.target.select()} aria-label="Invite link" style={{ flex: 1 }} /><button className="btn" onClick={() => navigator.clipboard?.writeText(invite)}>Copy</button></div>}</div>}
      </div>)}

    <div className="glass card" style={{ marginTop: 12, maxWidth: 620 }}>
      <h3>Leave or delete</h3>
      <div className="row">
        <button className="btn ghost" disabled={busy || !can(myRole, "leave", undefined, { onlyMember: members.length === 1 })} title={myRole === "owner" && members.length > 1 ? "Transfer ownership first" : undefined}
          onClick={async () => { if (!confirm("Leave this group?")) return; const r = await act({ action: "leave" }, "Left"); if (!r.error) router.replace("/rooms"); }}>Leave group</button>
        {can(myRole, "deleteGroup") && <button className="btn" style={{ background: "#d6336c" }} onClick={async () => { if (!confirm(`Delete "${g.title}" and all its messages for everyone? This can't be undone.`)) return; const r = await api(`/api/groups/${id}`, "DELETE"); if (!r.error) router.replace("/rooms"); else setNote("Couldn't delete."); }}>Delete group</button>}
      </div>
      {myRole === "owner" && members.length > 1 && <p className="muted">Owners must transfer ownership before leaving.</p>}
    </div>
  </>);
}
