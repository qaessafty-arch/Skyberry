"use client";
import { supabase } from "@/lib/supabase/browser";

export interface SigMsg { type: "hello" | "hello-ack" | "sdp" | "ice" | "state" | "bye"; from: string; to?: string; name?: string; desc?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null; mic?: boolean; cam?: boolean; screen?: boolean }
export interface Signaling {
  send(m: Omit<SigMsg, "from">): void;
  onMessage(cb: (m: SigMsg) => void): void;
  /** Fired when a participant disappears without saying goodbye (crash, closed tab). */
  onGone(cb: (id: string) => void): void;
  join(self: { id: string; name: string }): Promise<void>;
  leave(): void;
}

/**
 * Production signaling: a PRIVATE Supabase Realtime channel `call:<conversationId>`.
 * Access is limited to conversation members by the RLS policies on realtime.messages (migration 0005).
 */
export function supabaseSignaling(conversationId: string): Signaling {
  let msgCb: (m: SigMsg) => void = () => {}, goneCb: (id: string) => void = () => {}; let self = ""; let ch: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
  return {
    send: (m) => { ch?.send({ type: "broadcast", event: "sig", payload: { ...m, from: self } }); },
    onMessage: (cb) => { msgCb = cb; }, onGone: (cb) => { goneCb = cb; },
    async join(me) {
      self = me.id; const sb = supabase();
      await sb.realtime.setAuth();
      ch = sb.channel(`call:${conversationId}`, { config: { private: true, broadcast: { self: false }, presence: { key: me.id } } });
      ch.on("broadcast", { event: "sig" }, ({ payload }) => { const m = payload as SigMsg; if (!m.to || m.to === self) msgCb(m); });
      ch.on("presence", { event: "leave" }, ({ key }) => key && key !== self && goneCb(key));
      await new Promise<void>((res, rej) => ch!.subscribe((s, e) => { if (s === "SUBSCRIBED") { ch!.track({ id: me.id, name: me.name }); res(); } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") rej(e ?? new Error("Couldn't connect to the call channel")); }));
    },
    leave() { if (ch) { supabase().removeChannel(ch); ch = null; } },
  };
}

/** Same-origin signaling over BroadcastChannel — used by the backend-free test lab, never in production. */
export function localSignaling(room: string): Signaling {
  let bc: BroadcastChannel | null = null; let self = ""; let msgCb: (m: SigMsg) => void = () => {}, goneCb: (id: string) => void = () => {};
  return {
    send: (m) => bc?.postMessage({ ...m, from: self }), onMessage: (cb) => { msgCb = cb; }, onGone: (cb) => { goneCb = cb; },
    async join(me) { self = me.id; bc = new BroadcastChannel(`ocean-call-${room}`); bc.onmessage = (e) => { const m = e.data as SigMsg; if (m.from === self) return; if (m.type === "bye") goneCb(m.from); if (!m.to || m.to === self) msgCb(m); }; },
    leave() { bc?.postMessage({ type: "bye", from: self }); bc?.close(); bc = null; },
  };
}
