"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { api, uploadMedia, useFriends, useMe } from "@/lib/data";
import { usePrefs } from "@/lib/usePrefs";
import type { Shot } from "@/modules/camera/CameraStudio";

const CameraStudio = dynamic(() => import("@/modules/camera/CameraStudio").then((m) => m.CameraStudio), { ssr: false });

/** Capture → Edit → Select audience → Preview → Share. */
export default function CameraPage() {
  const me = useMe(); const { friends } = useFriends(me); const [prefs] = usePrefs();
  const [shot, setShot] = useState<Shot | null>(null);
  const [target, setTarget] = useState<string>("moment:friends");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState("");
  const chats = friends?.filter((f) => f.status === "accepted" && f.conversationId) ?? [];

  async function share() {
    if (!shot) return; setBusy(true);
    try {
      const path = await uploadMedia(shot.blob);
      const [kind, id] = target.split(":");
      if (kind === "chat") await api("/api/messages", "POST", { conversationId: id, kind: "image", mediaPath: path, body: "📷" });
      else if (kind === "moment") await api("/api/moments", "POST", { kind: "photo", mediaPath: path, audience: id });
      else if (kind === "saved") { const { supabase } = await import("@/lib/supabase/browser"); await supabase().from("memories").insert({ owner_id: me!.id, media_path: path, title: "Saved from camera" }); }
      setDone("Shared! 🌊"); setShot(null);
    } catch { setDone("Couldn't share. Try again."); } finally { setBusy(false); }
  }

  return (<>
    <h1>📷 Camera Studio</h1>
    {done && <p role="status" className="chip">{done}</p>}
    {!shot ? <CameraStudio reducedMotion={prefs.reducedMotion} onDone={(s) => { setDone(""); setShot(s); }} /> : (
      <div className="glass card" style={{ maxWidth: 560, display: "grid", gap: 12 }}>
        <h2>Preview & share</h2>
        <img src={shot.url} alt="Preview" style={{ width: "100%", borderRadius: 18 }} />
        <label>Send to
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label="Moments"><option value="moment:friends">All friends</option><option value="moment:private">Only me (daily camera roll)</option></optgroup>
            <optgroup label="Chats">{chats.map((f) => <option key={f.conversationId} value={`chat:${f.conversationId}`}>{f.other.display_name}</option>)}</optgroup>
            <optgroup label="Memories"><option value="saved:me">Save to memories</option></optgroup>
          </select></label>
        <div className="row"><button className="btn ghost" onClick={() => setShot(null)}>← Back</button><button className="btn" disabled={busy} onClick={share}>{busy ? "Sharing…" : "Share"}</button></div>
      </div>)}
  </>);
}
