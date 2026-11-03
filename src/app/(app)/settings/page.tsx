"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useMe } from "@/lib/data";
import { usePrefs } from "@/lib/usePrefs";
import { Account } from "./Account";
import { isValidTimeZone } from "@/lib/progression/time";

export default function Settings() {
  const me = useMe(); const router = useRouter(); const [prefs, setPrefs] = usePrefs();
  const [tz, setTz] = useState(""); const [streak, setStreak] = useState({ streakVisible: true, streakReminders: false, muteStreakNotifs: false }); const [note, setNote] = useState("");
  useEffect(() => { if (!me) return; setTz(me.tz); supabase().from("profiles").select("settings").eq("id", me.id).single().then(({ data }) => data && setStreak({ ...streak, ...data.settings })); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [me]);
  async function save() {
    if (!isValidTimeZone(tz)) return setNote("That time zone isn't valid (try e.g. Europe/Paris).");
    const { error } = await supabase().from("profiles").update({ tz, settings: { ...streak, reducedMotion: prefs.reducedMotion, lowPower: prefs.lowPower, universe3d: prefs.universe3d } }).eq("id", me!.id);
    setNote(error ? "Couldn't save." : "Saved ✓");
  }
  const T = ({ k, label, hint }: { k: keyof typeof streak; label: string; hint?: string }) => <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={streak[k]} onChange={(e) => setStreak({ ...streak, [k]: e.target.checked })} /><span>{label}{hint && <span className="muted"> — {hint}</span>}</span></label>;
  return (<><h1>⚙️ Settings</h1>
    <Account />
    <div className="glass card" style={{ display: "grid", gap: 10, maxWidth: 560 }}>
      <h3>Streaks</h3>
      <T k="streakVisible" label="Show streaks" hint="hide the 🔥 counters everywhere for you" /><T k="streakReminders" label="Gentle streak reminders" hint="off by default" /><T k="muteStreakNotifs" label="Mute streak notifications" />
      <p className="muted">There are no public rankings. Missed days are forgiven and broken streaks can be restored for free.</p>
      <h3>Performance &amp; accessibility</h3>
      <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={prefs.reducedMotion} onChange={(e) => setPrefs({ reducedMotion: e.target.checked })} />Reduced motion</label>
      <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={prefs.lowPower} onChange={(e) => setPrefs({ lowPower: e.target.checked })} />Low-power 3D (simpler models, lower resolution)</label>
      <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={prefs.universe3d} onChange={(e) => setPrefs({ universe3d: e.target.checked })} />3D Ocean Universe (off = simple list)</label>
      <label>3D ocean background
        <select value={prefs.bg} onChange={(e) => setPrefs({ bg: e.target.value as "auto" | "on" | "off" })}><option value="auto">Auto (reduces on weaker devices)</option><option value="on">Always on</option><option value="off">Off</option></select></label>
      <label>Background intensity<input type="range" min={0} max={1} step={0.05} value={prefs.bgIntensity} onChange={(e) => setPrefs({ bgIntensity: +e.target.value })} /></label>
      <h3>Time zone</h3><input value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Time zone" /><span className="muted">Daily streak resets happen at midnight in your friendship's time zone.</span>
      <div className="row"><button className="btn" onClick={save}>Save</button><button className="btn ghost" onClick={async () => { await supabase().auth.signOut(); router.replace("/login"); router.refresh(); }}>Sign out</button>{note && <span role="status">{note}</span>}</div>
    </div></>);
}
