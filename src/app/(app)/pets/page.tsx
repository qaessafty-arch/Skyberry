"use client";
import { useState } from "react";
import { api, streakView, useFriends, useMe, type Friend } from "@/lib/data";
import { usePrefs } from "@/lib/usePrefs";
import { PetStage } from "@/modules/social/Pet";
import { ACCESSORIES, HOMES, COLOR_PRESETS, SPECIES, unlockedRewards, type SpeciesId, type Personality } from "@/modules/pets/catalog";
import { EVOLUTION_STAGES, MILESTONES } from "@/lib/progression/milestones";
import { levelForXp } from "@/lib/progression/interactions";
import type { Mood } from "@/modules/pets/Pet3D";

export default function Pets() {
  const me = useMe(); const { friends, reload } = useFriends(me); const [prefs] = usePrefs();
  const list = friends?.filter((f) => f.status === "accepted" && f.pet) ?? [];
  const [sel, setSel] = useState(0); const [mood, setMood] = useState<Mood>("idle"); const [note, setNote] = useState("");
  const f: Friend | undefined = list[sel];
  if (!friends) return <p className="muted">Loading…</p>;
  if (!f || !f.pet) return <div className="glass card"><h1>🐙 Pets</h1><p className="muted">Every friendship hatches its own pet. Add a friend to get started — or <a href="/lab" style={{ textDecoration: "underline" }}>visit the Pet Lab</a>.</p></div>;
  const pet = f.pet; const prog = f.progress!; const have = unlockedRewards(prog.unlocked); const sv = streakView(f);
  const next = MILESTONES.find((m) => m.day > prog.streak.longest);

  async function care(action: "feed" | "play" | "clean" | "gift") {
    const r = await api<{ done: boolean; reason?: string }>("/api/pet", "POST", { friendshipId: f!.friendshipId, action });
    setNote(r.done ? `${pet.name} loved that! 💙` : "Plenty for today — come back tomorrow 🌙"); if (r.done) { setMood(action === "play" ? "dance" : "excited"); setTimeout(() => setMood("idle"), 3000); reload(); }
  }
  const patch = async (b: Record<string, unknown>) => { const r = await api("/api/pet", "PATCH", { friendshipId: f.friendshipId, ...b }); if (r.error) setNote("That isn't unlocked yet."); reload(); };
  const unlockedAcc = (a: (typeof ACCESSORIES)[number]) => a.unlock === null || (a.unlock === "__stage3" ? prog.evolution >= 3 : have.has(a.unlock));

  return (<>
    <h1>🐙 Pets</h1>
    {list.length > 1 && <div className="row">{list.map((x, i) => <button key={x.friendshipId} className={`btn ${i === sel ? "" : "ghost"}`} onClick={() => setSel(i)}>{x.pet!.name} · {x.other.display_name}</button>)}</div>}
    <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
      <PetStage species={pet.species as SpeciesId} colors={pet.colors} equipped={pet.equipped} evolution={prog.evolution} personality={pet.personality as Personality} home={pet.home} mood={mood} height={360} lowPower={prefs.lowPower} reducedMotion={prefs.reducedMotion} />
      <div className="glass card">
        <div className="row"><h2 style={{ margin: 0 }}>{pet.name}</h2><span className="chip">{SPECIES.find((s) => s.id === pet.species)?.name}</span><span className="chip">{pet.rarity}</span><span className="chip">{EVOLUTION_STAGES[prog.evolution].name}</span><span className="chip">Lv {levelForXp(prog.xp)}</span><span className="chip">{pet.personality}</span></div>
        <p className="muted">{sv.value > 0 ? `${sv.status === "resting" ? "🌙 Streak resting at" : "🔥"} ${sv.value} days` : "No streak yet"} · best {prog.streak.longest}. {next && `Next milestone: ${next.title} at day ${next.day}.`} {pet.name} never gets sad or sick if you take a break.</p>
        <div className="row">{(["feed", "play", "clean", "gift"] as const).map((a) => <button key={a} className="btn" onClick={() => care(a)}>{{ feed: "🍤 Feed", play: "🎾 Play", clean: "🫧 Clean", gift: "🎁 Gift" }[a]}</button>)}{note && <span role="status" className="chip">{note}</span>}</div>
      </div>
      <div className="glass card"><h3>Customize</h3>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = new FormData(e.currentTarget).get("name") as string; if (n) patch({ name: n }); }}><input name="name" defaultValue={pet.name} maxLength={24} aria-label="Pet name" style={{ maxWidth: 220 }} /><button className="btn ghost">Rename</button></form>
        <div className="row" style={{ marginTop: 10 }}><b>Colors</b>{COLOR_PRESETS.map((c, i) => <button key={i} aria-label={`Color ${i + 1}`} onClick={() => patch({ colors: c })} style={{ width: 32, height: 32, borderRadius: 99, border: "2px solid #fff", background: `linear-gradient(135deg,${c.body} 60%,${c.accent})` }} />)}</div>
        <div className="row" style={{ marginTop: 10 }}><b>Accessories</b>{ACCESSORIES.map((a) => { const ok = unlockedAcc(a); const on = pet.equipped.includes(a.id); return <button key={a.id} disabled={!ok} className={`btn ${on ? "" : "ghost"}`} onClick={() => patch({ equipped: on ? pet.equipped.filter((x) => x !== a.id) : [...pet.equipped, a.id] })}>{ok ? "" : "🔒 "}{a.name}</button>; })}</div>
        <div className="row" style={{ marginTop: 10 }}><b>Home</b>{HOMES.map((h) => { const ok = h.unlock === null || have.has(h.unlock); return <button key={h.id} disabled={!ok} className={`btn ${pet.home === h.id ? "" : "ghost"}`} onClick={() => patch({ home: h.id })}>{ok ? "" : "🔒 "}{h.name}</button>; })}</div>
      </div>
      <div className="glass card"><h3>Milestones</h3><div className="grid">{MILESTONES.map((m) => <div key={m.id} className="card glass" style={{ opacity: prog.unlocked.includes(m.id) ? 1 : 0.5 }}><b>Day {m.day}</b><div>{m.title}</div><div className="muted">{m.rewards.map((r) => r.id).join(", ")}</div></div>)}</div></div>
    </div>
  </>);
}
