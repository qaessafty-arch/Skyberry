"use client";
import Link from "next/link";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { api, useMe } from "@/lib/data";
import { CallRoom } from "@/modules/calls/CallRoom";
import { supabaseSignaling } from "@/modules/calls/signaling";
import { callMode, type CallRoomType } from "@/lib/calls/logic";

function Call({ id }: { id: string }) {
  const me = useMe(); const router = useRouter(); const q = useSearchParams();
  const [info, setInfo] = useState<{ title: string; kind: string; room_type: CallRoomType; names: string[] } | null>(null); const [missing, setMissing] = useState(false); const [ice, setIce] = useState<RTCIceServer[] | null>(null);
  const joined = useRef(false);
  useEffect(() => { (async () => {
    const sb = supabase(); const { data: c } = await sb.from("conversations").select("title,kind,room_type,expires_at").eq("id", id).maybeSingle();
    if (!c || (c.expires_at && Date.parse(c.expires_at) < Date.now())) return setMissing(true);
    const { data: mem } = await sb.from("conversation_members").select("user_id").eq("conversation_id", id);
    const { data: ps } = await sb.from("profiles").select("id,display_name").in("id", (mem ?? []).map((m) => m.user_id));
    setInfo({ title: c.title ?? (ps ?? []).filter((p) => p.id !== me?.id).map((p) => p.display_name).join(", ") ?? "Call", kind: c.kind, room_type: c.room_type, names: (ps ?? []).map((p) => p.display_name) });
    const r = await api<{ iceServers: RTCIceServer[] }>("/api/calls/ice", "GET"); setIce(r.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }]);
  })(); }, [id, me?.id]);
  const sig = useMemo(() => supabaseSignaling(id), [id]);
  const mode = (q.get("mode") as "audio" | "video" | null) ?? (info ? callMode(info.room_type) : "video");
  // If the tab closes mid-call, tell the server so the call can end / count as missed.
  useEffect(() => { const h = () => { if (joined.current) navigator.sendBeacon?.("/api/calls", new Blob([JSON.stringify({ conversationId: id, action: "leave" })], { type: "application/json" })); }; addEventListener("pagehide", h); return () => removeEventListener("pagehide", h); }, [id]);

  if (missing) return <div className="glass card"><h2>This room isn't available</h2><p className="muted">It may have ended, or you're not a member.</p><Link className="btn" href="/rooms">Back to rooms</Link></div>;
  if (!me || !info || !ice) return <div className="glass card skeleton" style={{ height: 200 }} aria-busy />;
  return <CallRoom selfId={me.id} name={me.display_name} sig={sig} mode={mode} iceServers={ice} title={`${mode === "video" ? "🎥" : "🎙️"} ${info.title}`}
    onStart={() => { joined.current = true; api("/api/calls", "POST", { conversationId: id, action: "join", mode }); }} onEnd={() => { joined.current = false; api("/api/calls", "POST", { conversationId: id, action: "leave" }); }} onLeave={() => router.replace(`/chats?c=${id}`)} />;
}
export default function CallPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense fallback={<div className="glass card skeleton" style={{ height: 200 }} />}><Call id={id} /></Suspense>; }
