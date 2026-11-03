"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { api } from "@/lib/data";

/** Redeems a friend/group invite link. Codes are single-use by default and expire; the server decides validity. */
export default function Invite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params); const r = useRouter(); const [msg, setMsg] = useState("Opening your invite…");
  useEffect(() => { (async () => {
    const { data } = await supabase().auth.getUser();
    if (!data.user) return r.replace(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
    const res = await api<{ conversationId?: string }>("/api/invites", "PUT", { code });
    if (res.error || !res.conversationId) setMsg("This invite is invalid, expired, or already used."); else r.replace(`/chats?c=${res.conversationId}`);
  })(); }, [code, r]);
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}><div className="glass card"><h2>{msg}</h2></div></main>;
}
