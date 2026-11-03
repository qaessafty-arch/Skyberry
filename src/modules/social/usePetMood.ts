"use client";
import { useEffect, useRef, useState } from "react";
import type { Mood } from "@/modules/pets/Pet3D";

export interface PetEvent { kind: "message" | "sticker" | "moment" | "care" | "milestone"; mine: boolean; at: number }

/** Maps chat events to a pet mood. Reactions are brief and purely visual; they never block messaging. */
export function usePetMood(events: PetEvent[], sleepyAfterMs = 10 * 60_000): Mood {
  const [mood, setMood] = useState<Mood>("welcome");
  const seen = useRef(0);
  useEffect(() => { const t = setTimeout(() => setMood("idle"), 3000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const fresh = events.slice(seen.current); seen.current = events.length;
    const last = fresh[fresh.length - 1]; if (!last) return;
    const m: Mood = last.kind === "sticker" ? "laugh" : last.kind === "moment" || last.kind === "milestone" ? "dance" : last.kind === "care" ? "excited" : last.mine ? "idle" : "excited";
    setMood(m); const t = setTimeout(() => setMood("idle"), 3500); return () => clearTimeout(t);
  }, [events]);
  useEffect(() => {
    const id = setInterval(() => { const l = events[events.length - 1]; if (!l || Date.now() - l.at > sleepyAfterMs) setMood((m) => (m === "idle" ? "sleep" : m)); }, 30_000);
    return () => clearInterval(id);
  }, [events, sleepyAfterMs]);
  return mood;
}
