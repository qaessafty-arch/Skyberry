"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { api, uploadMedia, useMe } from "@/lib/data";
import { ChatStyleEditor } from "@/modules/social/ChatStyleEditor";
import { DEFAULT_STYLE, sanitizeStyle, type ChatStyle } from "@/modules/social/chatStyle";

const KINDS = [["message", "Messages"], ["friend_request", "Friend requests"], ["group_invite", "Group invitations"], ["mention", "Mentions"], ["reaction", "Reactions"], ["missed_call", "Missed calls"], ["room_invite", "Room invitations"], ["moment", "New moments"], ["sticker_request", "Sticker requests"], ["call", "Calls"]] as const;

export function Account() {
  const me = useMe();
  const [p, setP] = useState({ display_name: "", bio: "", status_text: "", show_presence: true });
  const [notify, setNotify] = useState<Record<string, boolean>>({}); const [quiet, setQuiet] = useState({ on: false, start: "22:00", end: "07:00" });
  const [note, setNote] = useState(""); const [del, setDel] = useState(""); const [chatDef, setChatDef] = useState<ChatStyle>(DEFAULT_STYLE);
  useEffect(() => { (async () => {
    if (!me) return; const sb = supabase();
    const { data } = await sb.from("profiles").select("display_name,bio,status_text,show_presence").eq("id", me.id).single(); if (data) setP({ display_name: data.display_name, bio: data.bio ?? "", status_text: data.status_text ?? "", show_presence: data.show_presence });
    const { data: s } = await sb.from("user_settings").select("*").eq("user_id", me.id).maybeSingle();
    if (s) { setChatDef(sanitizeStyle(s.appearance?.chatDefault)); setNotify(s.notify ?? {}); if (s.quiet_hours) setQuiet({ on: true, ...s.quiet_hours }); }
  })(); }, [me]);
  async function save() {
    if (!me) return; const sb = supabase();
    const a = await sb.from("profiles").update({ display_name: p.display_name.trim() || "Friend", bio: p.bio || null, status_text: p.status_text || null, show_presence: p.show_presence }).eq("id", me.id);
    const b = await sb.from("user_settings").upsert({ user_id: me.id, notify, quiet_hours: quiet.on ? { start: quiet.start, end: quiet.end } : null, updated_at: new Date().toISOString() });
    setNote(a.error || b.error ? "Couldn't save" : "Saved ✓");
  }
  async function saveChatDefault(st: ChatStyle) {
    const sb = supabase(); const { data: cur } = await sb.from("user_settings").select("appearance").eq("user_id", me!.id).maybeSingle();
    const { error } = await sb.from("user_settings").upsert({ user_id: me!.id, appearance: { ...(cur?.appearance ?? {}), chatDefault: st }, updated_at: new Date().toISOString() }); setNote(error ? "Couldn't save chat look" : "Default chat look saved ✓");
  }
  async function avatar(f: File) { try { const path = await uploadMedia(f, f.name.split(".").pop() ?? "jpg"); await supabase().from("profiles").update({ avatar_path: path }).eq("id", me!.id); setNote("Profile picture updated"); } catch { setNote("Upload failed"); } }
  async function exportData() { const r = await fetch("/api/account"); if (!r.ok) return setNote("Export failed"); const blob = new Blob([JSON.stringify(await r.json(), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ocean-export.json"; a.click(); }
  async function deleteAccount() { const r = await api("/api/account", "DELETE", { confirm: del }); if (r.error) return setNote("Type your handle exactly to confirm."); await supabase().auth.signOut(); location.href = "/"; }
  return (
    <div className="glass card" style={{ display: "grid", gap: 10, maxWidth: 560, marginBottom: 14 }}>
      <h3>Profile</h3>
      <label>Display name<input value={p.display_name} maxLength={40} onChange={(e) => setP({ ...p, display_name: e.target.value })} /></label>
      <label>Bio<textarea rows={2} maxLength={280} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></label>
      <label>Status<input value={p.status_text} maxLength={80} placeholder="e.g. 🌊 diving" onChange={(e) => setP({ ...p, status_text: e.target.value })} /></label>
      <label className="btn ghost" style={{ cursor: "pointer", width: "fit-content" }}>🖼️ Profile picture<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && avatar(e.target.files[0])} /></label>
      <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={p.show_presence} onChange={(e) => setP({ ...p, show_presence: e.target.checked })} />Show when I'm online / last seen</label>
      <h3>Default chat look</h3><p className="muted" style={{ margin: 0 }}>Used for every conversation you haven't customised. Customise one chat from its 🎨 button.</p>
      <ChatStyleEditor style={chatDef} onChange={setChatDef} onCommit={saveChatDefault} />
      <h3>Notifications</h3>
      {KINDS.map(([k, l]) => <label key={k} className="row"><input type="checkbox" style={{ width: "auto" }} checked={notify[k] ?? true} onChange={(e) => setNotify({ ...notify, [k]: e.target.checked })} />{l}</label>)}
      <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={quiet.on} onChange={(e) => setQuiet({ ...quiet, on: e.target.checked })} />Quiet hours</label>
      {quiet.on && <div className="row"><input type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} style={{ width: "auto" }} /> to <input type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} style={{ width: "auto" }} /></div>}
      <div className="row"><button className="btn" onClick={save}>Save profile &amp; notifications</button>{note && <span role="status">{note}</span>}</div>
      <h3>Your data</h3>
      <div className="row"><button className="btn ghost" onClick={exportData}>⬇ Export my data (JSON)</button></div>
      <details><summary>Delete my account</summary><p className="muted">This permanently deletes your profile, messages, moments, files and friendships. Type your handle ({me?.handle}) to confirm.</p>
        <div className="row"><input value={del} onChange={(e) => setDel(e.target.value)} aria-label="Confirm handle" style={{ flex: 1 }} /><button className="btn" style={{ background: "#d6336c" }} onClick={deleteAccount}>Delete forever</button></div></details>
    </div>
  );
}
