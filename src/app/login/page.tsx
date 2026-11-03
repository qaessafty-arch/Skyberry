"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";

export default function Login() {
  const r = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ email: "", password: "", handle: "", name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function forgot() {
    if (!f.email) return setErr("Enter your email first.");
    const { error } = await supabase().auth.resetPasswordForEmail(f.email, { redirectTo: `${location.origin}/reset` });
    setErr(error ? error.message : "If that email exists, a reset link is on its way.");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const sb = supabase();
    if (mode === "up") {
      if (!/^[a-z0-9_]{3,20}$/.test(f.handle)) { setErr("Handle: 3–20 lowercase letters, numbers or _"); setBusy(false); return; }
      const { data, error } = await sb.auth.signUp({ email: f.email, password: f.password });
      if (error || !data.user) { setErr(error?.message ?? "Sign-up failed"); setBusy(false); return; }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { error: pe } = await sb.from("profiles").insert({ id: data.user.id, handle: f.handle, display_name: f.name || f.handle, tz });
      if (pe) { setErr(pe.message); setBusy(false); return; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    const next = new URLSearchParams(location.search).get("next");
    r.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/chats"); r.refresh();
  }
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <form onSubmit={submit} className="glass card" style={{ width: "min(420px,100%)", display: "grid", gap: 10, padding: 26 }}>
        <h1>🌊 {mode === "in" ? "Welcome back" : "Join OCEAN"}</h1>
        {mode === "up" && <><input placeholder="Display name" value={f.name} onChange={set("name")} aria-label="Display name" /><input placeholder="handle (e.g. coral_kid)" value={f.handle} onChange={set("handle")} aria-label="Handle" /></>}
        <input type="email" required placeholder="Email" value={f.email} onChange={set("email")} aria-label="Email" />
        <input type="password" required minLength={8} placeholder="Password" value={f.password} onChange={set("password")} aria-label="Password" />
        {err && <div role="alert" style={{ color: "#d6336c" }}>{err}</div>}
        <button className="btn" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
        {mode === "in" && <button type="button" className="btn ghost" onClick={forgot}>Forgot password?</button>}
        <button type="button" className="btn ghost" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}</button>
      </form>
    </main>
  );
}
