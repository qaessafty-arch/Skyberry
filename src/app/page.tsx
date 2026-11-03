import { redirect } from "next/navigation";
import Link from "next/link";
import { userClient } from "@/lib/supabase/server";

export default async function Home() {
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured) {
    const { data } = await (await userClient()).auth.getUser();
    if (data.user) redirect("/chats");
  }
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20, textAlign: "center" }}>
      <div className="glass card" style={{ maxWidth: 520, padding: 32 }}>
        <h1 style={{ fontSize: "2.6rem" }}>🌊 OCEAN</h1>
        <p className="muted">A little world for the people who matter.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          {configured ? <Link className="btn" href="/login">Dive in</Link> : <span className="chip">Set Supabase env vars to enable sign-in</span>}
          <Link className="btn ghost" href="/lab">Meet the pets</Link>
        </div>
      </div>
    </main>
  );
}
