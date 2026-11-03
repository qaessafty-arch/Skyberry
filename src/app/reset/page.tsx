"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";

/** Landing page for the password-reset email link (Supabase puts a recovery session in the URL). */
export default function Reset() {
  const r = useRouter(); const [pw, setPw] = useState(""); const [msg, setMsg] = useState("");
  async function go(e: React.FormEvent) { e.preventDefault(); const { error } = await supabase().auth.updateUser({ password: pw }); if (error) setMsg(error.message); else r.replace("/chats"); }
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}><form onSubmit={go} className="glass card" style={{ width: "min(420px,100%)", display: "grid", gap: 10 }}>
    <h1>Choose a new password</h1><input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" /><button className="btn">Update password</button>{msg && <p role="alert">{msg}</p>}</form></main>;
}
