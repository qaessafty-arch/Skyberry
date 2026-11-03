"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { api, uploadMedia, uploadValidated, useFriends, useMe } from "@/lib/data";
import type { EditedVideo } from "@/modules/camera/VideoEditor";
import { usePrefs } from "@/lib/usePrefs";
import type { Shot } from "@/modules/camera/CameraStudio";

const CameraStudio = dynamic(() => import("@/modules/camera/CameraStudio").then((m) => m.CameraStudio), { ssr: false });

/** Capture → Edit → Select audience → Preview → Share. */
export default function CameraPage() {
  const me = useMe(); const { friends } = useFriends(me); const [prefs] = usePrefs();
  const [shot, setShot] = useState<Shot | null>(null); const [video, setVideo] = useState<EditedVideo | null>(null);
  const [target, setTarget] = useState<string>("moment:friends");
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState("");
  const chats = friends?.filter((f) => f.status === "accepted" && f.conversationId) ?? [];

  async function share() {
    if (!shot && !video) return; setBusy(true);
    try {
      let path: string; let cover: string | undefined;
      if (video) {
        const ext = video.mime.includes("mp4") ? "mp4" : "webm";
        path = (await uploadValidated(new File([video.blob], `video-${Date.now()}.${ext}`, { type: video.mime }))).path;
        if (video.cover) cover = (await uploadValidated(new File([video.cover], `cover-${Date.now()}.jpg`, { type: "image/jpeg" }))).path;
      } else path = await uploadMedia(shot!.blob);
      const [kind, id] = target.split(":");
      if (kind === "chat") await api("/api/messages", "POST", { conversationId: id, kind: video ? "video" : "image", mediaPath: path, body: video ? "🎬" : "📷", meta: cover ? { cover } : undefined });
      else if (kind === "moment") await api("/api/moments", "POST", { kind: video ? "video" : "photo", mediaPath: path, audience: id, permanent: keep, meta: cover ? { cover } : undefined });
      else if (kind === "saved") { const { supabase } = await import("@/lib/supabase/browser"); await supabase().from("memories").insert({ owner_id: me!.id, media_path: path, title: video ? "Video from camera" : "Saved from camera" }); }
      setDone("Shared! 🌊"); setShot(null); setVideo(null);
    } catch { setDone("Couldn't share. Try again."); } finally { setBusy(false); }
  }

  return (<>
    <h1>📷 Camera Studio</h1>
    {done && <p role="status" className="chip">{done}</p>}
    {!shot && !video ? <CameraStudio reducedMotion={prefs.reducedMotion} onDone={(s) => { setDone(""); setShot(s); }} onDoneVideo={(v) => { setDone(""); setVideo(v); }} /> : (
      <div className="glass card" style={{ maxWidth: 560, display: "grid", gap: 12 }}>
        <h2>Preview & share</h2>
        {video ? <video src={video.url} controls playsInline style={{ width: "100%", borderRadius: 18, background: "#000" }} /> : <img src={shot!.url} alt="Preview" style={{ width: "100%", borderRadius: 18 }} />}
        <label>Send to
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label="Moments (24h story)"><option value="moment:friends">All friends</option><option value="moment:close">Close friends</option><option value="moment:private">Only me (daily camera roll)</option></optgroup>
            <optgroup label="Chats">{chats.map((f) => <option key={f.conversationId} value={`chat:${f.conversationId}`}>{f.other.display_name}</option>)}</optgroup>
            <optgroup label="Memories"><option value="saved:me">Save to memories</option></optgroup>
          </select></label>
        {target.startsWith("moment:") && target !== "moment:private" && <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep as a permanent memory (otherwise disappears after 24h)</label>}
        <div className="row"><button className="btn ghost" onClick={() => { setShot(null); setVideo(null); }}>← Back</button><button className="btn" disabled={busy} onClick={share}>{busy ? "Sharing…" : "Share"}</button></div>
      </div>)}
  </>);
}
