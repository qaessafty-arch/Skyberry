"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { SPECIES, PERSONALITIES, ACCESSORIES, COLOR_PRESETS, HOMES, type SpeciesId, type Personality } from "@/modules/pets/catalog";
import { EVOLUTION_STAGES } from "@/lib/progression/milestones";
import type { Mood } from "@/modules/pets/Pet3D";

const PetStage = dynamic(() => import("@/modules/pets/PetStage").then((m) => m.PetStage), { ssr: false, loading: () => <div className="glass" style={{ height: 380 }} /> });
const MOODS: Mood[] = ["idle", "excited", "dance", "laugh", "welcome", "shy", "sleep"];

/** Public sandbox: preview every species, mood, accessory and evolution stage. Nothing here is saved. */
export default function Lab() {
  const [species, setSpecies] = useState<SpeciesId>("axolotl");
  const [mood, setMood] = useState<Mood>("idle");
  const [persona, setPersona] = useState<Personality>("friendly");
  const [evo, setEvo] = useState(0);
  const [colors, setColors] = useState(COLOR_PRESETS[0]);
  const [eq, setEq] = useState<string[]>(["bow"]);
  const [home, setHome] = useState("aquarium");
  const [low, setLow] = useState(false);
  const [reduced, setReduced] = useState(false);
  const toggle = (id: string) => setEq(eq.includes(id) ? eq.filter((x) => x !== id) : [...eq, id]);
  return (
    <main className={reduced ? "reduced" : ""} style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
      <h1>🐙 Pet Lab</h1>
      <p className="muted">Tap the pet to make it giggle. Everything here is a live 3D scene.</p>
      <PetStage species={species} mood={mood} personality={persona} evolution={evo} colors={colors} equipped={eq} home={home} lowPower={low} reducedMotion={reduced} height={380} />
      <div className="glass card" style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <div className="row">{SPECIES.map((s) => <button key={s.id} className={`btn ${s.id === species ? "" : "ghost"}`} onClick={() => setSpecies(s.id)}>{s.name}</button>)}</div>
        <div className="row"><b>Mood</b>{MOODS.map((m) => <button key={m} className={`btn ${m === mood ? "" : "ghost"}`} onClick={() => setMood(m)}>{m}</button>)}</div>
        <div className="row"><b>Personality</b>{PERSONALITIES.map((m) => <button key={m} className={`btn ${m === persona ? "" : "ghost"}`} onClick={() => setPersona(m)}>{m}</button>)}</div>
        <div className="row"><b>Evolution</b>{EVOLUTION_STAGES.map((s) => <button key={s.stage} className={`btn ${s.stage === evo ? "" : "ghost"}`} onClick={() => setEvo(s.stage)}>{s.stage}: {s.name}</button>)}</div>
        <div className="row"><b>Colors</b>{COLOR_PRESETS.map((c, i) => <button key={i} aria-label={`Color preset ${i + 1}`} onClick={() => setColors(c)} style={{ width: 34, height: 34, borderRadius: 99, border: c === colors ? "3px solid var(--ink)" : "2px solid #fff", background: `linear-gradient(135deg,${c.body} 60%,${c.accent})` }} />)}
          <label>Body <input type="color" value={colors.body} onChange={(e) => setColors({ ...colors, body: e.target.value })} style={{ width: 50, padding: 2 }} /></label>
          <label>Accent <input type="color" value={colors.accent} onChange={(e) => setColors({ ...colors, accent: e.target.value })} style={{ width: 50, padding: 2 }} /></label></div>
        <div className="row"><b>Accessories</b>{ACCESSORIES.map((a) => <button key={a.id} className={`btn ${eq.includes(a.id) ? "" : "ghost"}`} onClick={() => toggle(a.id)}>{a.name}</button>)}</div>
        <div className="row"><b>Home</b>{HOMES.map((h) => <button key={h.id} className={`btn ${h.id === home ? "" : "ghost"}`} onClick={() => setHome(h.id)}>{h.name}</button>)}</div>
        <div className="row"><label><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} style={{ width: "auto" }} /> Low-power mode</label><label><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} style={{ width: "auto" }} /> Reduced motion</label></div>
      </div>
    </main>
  );
}
