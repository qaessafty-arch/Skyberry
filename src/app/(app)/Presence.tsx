"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase/browser";
/** Heartbeat: updates last_seen every minute while the tab is visible (users can opt out of showing presence in Settings). */
export function Presence() {
  useEffect(() => {
    const sb = supabase(); let id = "";
    const beat = async () => { if (document.hidden) return; if (!id) id = (await sb.auth.getUser()).data.user?.id ?? ""; if (id) await sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", id); };
    beat(); const t = setInterval(beat, 60_000); document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, []);
  return null;
}
