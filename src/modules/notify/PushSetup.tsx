"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/data";

/** URL-safe base64 → Uint8Array, as required by pushManager.subscribe. */
export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length)); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
}

/** Registers the service worker (also gives offline fallback) and manages this device's push subscription. */
export function PushSetup() {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "unconfigured" | "busy">("busy"); const [note, setNote] = useState("");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  useEffect(() => { (async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null); if (!reg) return setState("unsupported");
    if (!key) return setState("unconfigured");
    if (Notification.permission === "denied") return setState("denied");
    setState((await reg.pushManager.getSubscription()) ? "on" : "off");
  })(); }, [key]);

  async function enable() {
    setState("busy"); setNote("");
    try {
      const perm = await Notification.requestPermission(); if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key!) });
      const r = await api<{ ok: boolean }>("/api/push", "POST", { subscription: sub.toJSON() });
      if (r.error || !r.ok) { await sub.unsubscribe(); setNote("The server couldn't save this device."); return setState("off"); }
      setState("on");
    } catch { setNote("Couldn't enable push on this device."); setState("off"); }
  }
  async function disable() {
    setState("busy"); const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await api("/api/push", "DELETE", { endpoint: sub.endpoint }); await sub.unsubscribe(); } setState("off");
  }
  const msg = { unsupported: "Push notifications aren't supported in this browser. (On iPhone, add OCEAN to your Home Screen first.)", unconfigured: "Push isn't configured on this server yet (VAPID keys needed).", denied: "Notifications are blocked in your browser settings for this site.", busy: "", off: "", on: "" }[state];
  return (
    <div className="row">
      {state === "off" && <button className="btn" onClick={enable}>🔔 Enable push on this device</button>}
      {state === "on" && <><span className="chip">Push is on for this device</span><button className="btn ghost" onClick={disable}>Turn off</button></>}
      {state === "busy" && <span className="muted">Checking…</span>}
      {msg && <span className="muted">{msg}</span>}{note && <span role="alert" className="chip" style={{ background: "#ffe3e3" }}>{note}</span>}
    </div>);
}
