"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { streakView, useFriends, useMe } from "@/lib/data";
import { usePrefs } from "@/lib/usePrefs";
import type { Theme, Node } from "@/modules/social/UniverseScene";
import { EVOLUTION_STAGES } from "@/lib/progression/milestones";

const Scene = dynamic(() => import("@/modules/social/UniverseScene").then((m) => m.UniverseScene), { ssr: false, loading: () => <div className="glass" style={{ height: 460 }} /> });
const THEMES: [Theme, string][] = [["galaxy", "Ocean galaxy"], ["islands", "Floating islands"], ["underwater", "Underwater"], ["neon", "Neon ocean"], ["minimal", "Minimal"]];

/** Private by construction: only YOUR view of YOUR friendships. Nothing here is visible to anyone else. */
export default function Universe() {
  const me = useMe(); const { friends } = useFriends(me); const [prefs, setPrefs] = usePrefs(); const router = useRouter();
  const [theme, setTheme] = useState<Theme>("galaxy");
  const acc = friends?.filter((f) => f.status === "accepted") ?? [];
  const nodes: Node[] = acc.map((f) => ({ id: f.friendshipId, name: f.other.display_name, streak: streakView(f).value, evolution: f.progress?.evolution ?? 0, color: f.pet?.colors.body ?? f.other.color, conversationId: f.conversationId }));
  const open = (n: Node) => n.conversationId && router.push(`/chats?c=${n.conversationId}`);
  return (<>
    <h1>🪐 Ocean Universe</h1>
    <div className="row" style={{ marginBottom: 10 }}>
      <label className="chip"><input type="checkbox" checked={prefs.universe3d} onChange={(e) => setPrefs({ universe3d: e.target.checked })} style={{ width: "auto" }} /> 3D view</label>
      {prefs.universe3d && THEMES.map(([k, l]) => <button key={k} className={`btn ${k === theme ? "" : "ghost"}`} onClick={() => setTheme(k)}>{l}</button>)}
    </div>
    {prefs.universe3d && nodes.length > 0 && <Scene nodes={nodes} theme={theme} onOpen={open} lowPower={prefs.lowPower} reducedMotion={prefs.reducedMotion} />}
    <h2 style={{ marginTop: 16 }}>Your friends</h2>
    <ul className="grid" style={{ listStyle: "none", padding: 0 }}>
      {acc.map((f) => { const s = streakView(f); return (
        <li key={f.friendshipId} className="glass card"><b>{f.other.display_name}</b>
          <div className="muted">{f.pet ? `${f.pet.name} · ${EVOLUTION_STAGES[f.progress?.evolution ?? 0].name}` : ""}{s.value > 0 && ` · ${s.status === "resting" ? "🌙" : "🔥"} ${s.value}`}</div>
          <div className="row" style={{ marginTop: 8 }}><Link className="btn" href={`/chats?c=${f.conversationId}`}>Chat</Link><Link className="btn ghost" href="/pets">Pet home</Link></div></li>); })}
    </ul>
    {!acc.length && <p className="muted">Your universe fills with a world for each friend you add.</p>}
  </>);
}
