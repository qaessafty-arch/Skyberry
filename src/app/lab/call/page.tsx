"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CallRoom } from "@/modules/calls/CallRoom";
import { localSignaling } from "@/modules/calls/signaling";

/** Backend-free call sandbox: two tabs on the same origin join the same room via BroadcastChannel signaling. */
function Lab() {
  const q = useSearchParams(); const name = q.get("name") ?? "Guest"; const room = q.get("room") ?? "demo"; const mode = (q.get("mode") as "audio" | "video") ?? "video";
  const id = useMemo(() => `${name}-${Math.random().toString(36).slice(2, 6)}`, [name]); const sig = useMemo(() => localSignaling(room), [room]); const [left, setLeft] = useState(false);
  return <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}><h1>Call lab</h1>{left ? <p data-testid="left">You left.</p> : <CallRoom selfId={id} name={name} sig={sig} mode={mode} title={`Room ${room}`} iceServers={[]} onLeave={() => setLeft(true)} />}</main>;
}
export default function CallLab() { return <Suspense><Lab /></Suspense>; }
