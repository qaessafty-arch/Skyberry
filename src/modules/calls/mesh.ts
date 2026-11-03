"use client";
import { isPolite, lossBetween, MAX_MESH_PARTICIPANTS, qualityFromStats, type Quality } from "@/lib/calls/logic";
import type { SigMsg, Signaling } from "./signaling";

export interface PeerView { id: string; name: string; stream: MediaStream; mic: boolean; cam: boolean; screen: boolean; quality: Quality; connection: RTCPeerConnectionState }
interface Peer extends PeerView { pc: RTCPeerConnection; making: boolean; ignoreOffer: boolean; pendingIce: RTCIceCandidateInit[]; lastRx: { lost: number; received: number } | null }
export type CallEvent = { kind: "joined" | "left"; name: string };

/**
 * Full-mesh WebRTC call using the "perfect negotiation" pattern (collision-safe, glare-free).
 * Signaling is abstract (see signaling.ts). Suitable for small groups; larger rooms need an SFU.
 */
export class MeshCall {
  peers = new Map<string, Peer>(); local: MediaStream | null = null; screen: MediaStream | null = null;
  mic = true; cam = true; private timer: ReturnType<typeof setInterval> | null = null; private closed = false;
  constructor(private o: { selfId: string; name: string; sig: Signaling; iceServers: RTCIceServer[]; onChange: () => void; onEvent?: (e: CallEvent) => void }) {}

  async start(local: MediaStream) {
    this.local = local; this.cam = local.getVideoTracks().some((t) => t.enabled);
    this.o.sig.onMessage((m) => this.onSig(m).catch(() => {})); this.o.sig.onGone((id) => this.drop(id));
    await this.o.sig.join({ id: this.o.selfId, name: this.o.name });
    this.o.sig.send({ type: "hello", name: this.o.name });
    this.timer = setInterval(() => this.pollStats(), 3000);
  }

  private async onSig(m: SigMsg) {
    if (this.closed) return;
    if (m.type === "hello" || m.type === "hello-ack") {
      if (this.peers.size >= MAX_MESH_PARTICIPANTS - 1 && !this.peers.has(m.from)) return; // room full
      const fresh = !this.peers.has(m.from); this.ensure(m.from, m.name ?? "Friend");
      if (m.type === "hello") this.o.sig.send({ type: "hello-ack", to: m.from, name: this.o.name });
      if (fresh) { this.o.onEvent?.({ kind: "joined", name: m.name ?? "Friend" }); this.sendState(m.from); }
    } else if (m.type === "state") { const p = this.peers.get(m.from); if (p) { p.mic = m.mic ?? p.mic; p.cam = m.cam ?? p.cam; p.screen = m.screen ?? p.screen; this.o.onChange(); } }
    else if (m.type === "bye") this.drop(m.from);
    else if (m.type === "sdp" && m.desc) await this.onDesc(m.from, m.desc);
    else if (m.type === "ice") await this.onIce(m.from, m.candidate ?? null);
  }

  private ensure(id: string, name: string): Peer {
    const ex = this.peers.get(id); if (ex) return ex;
    const pc = new RTCPeerConnection({ iceServers: this.o.iceServers });
    const p: Peer = { id, name, stream: new MediaStream(), mic: true, cam: true, screen: false, quality: "good", connection: "new", pc, making: false, ignoreOffer: false, pendingIce: [], lastRx: null };
    this.peers.set(id, p);
    this.local?.getTracks().forEach((t) => pc.addTrack(t, this.local!));
    pc.ontrack = ({ track }) => { p.stream.addTrack(track); track.onended = () => { p.stream.removeTrack(track); this.o.onChange(); }; this.o.onChange(); };
    pc.onicecandidate = ({ candidate }) => this.o.sig.send({ type: "ice", to: id, candidate: candidate?.toJSON() ?? null });
    pc.onconnectionstatechange = () => { p.connection = pc.connectionState; if (pc.connectionState === "failed") pc.restartIce(); this.o.onChange(); };
    pc.onnegotiationneeded = async () => {
      try { p.making = true; await pc.setLocalDescription(); this.o.sig.send({ type: "sdp", to: id, desc: pc.localDescription!.toJSON() }); } catch { /* retried on next negotiationneeded */ } finally { p.making = false; }
    };
    this.o.onChange(); return p;
  }

  private async onDesc(from: string, desc: RTCSessionDescriptionInit) {
    const p = this.ensure(from, "Friend"); const pc = p.pc;
    const collision = desc.type === "offer" && (p.making || pc.signalingState !== "stable");
    p.ignoreOffer = !isPolite(this.o.selfId, from) && collision; if (p.ignoreOffer) return;
    await pc.setRemoteDescription(desc);
    for (const c of p.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    if (desc.type === "offer") { await pc.setLocalDescription(); this.o.sig.send({ type: "sdp", to: from, desc: pc.localDescription!.toJSON() }); }
  }
  private async onIce(from: string, c: RTCIceCandidateInit | null) {
    const p = this.peers.get(from); if (!p || !c) return;
    if (!p.pc.remoteDescription) { p.pendingIce.push(c); return; }
    try { await p.pc.addIceCandidate(c); } catch (e) { if (!p.ignoreOffer) throw e; }
  }

  private drop(id: string) { const p = this.peers.get(id); if (!p) return; p.pc.close(); this.peers.delete(id); this.o.onEvent?.({ kind: "left", name: p.name }); this.o.onChange(); }
  private sendState(to?: string) { this.o.sig.send({ type: "state", to, mic: this.mic, cam: this.cam, screen: !!this.screen }); }

  setMic(on: boolean) { this.mic = on; this.local?.getAudioTracks().forEach((t) => (t.enabled = on)); this.sendState(); this.o.onChange(); }
  setCam(on: boolean) { this.cam = on; this.local?.getVideoTracks().forEach((t) => (t.enabled = on)); this.sendState(); this.o.onChange(); }

  /** Switch microphone/camera: swap the live track for every peer without renegotiating. */
  async switchDevice(kind: "audio" | "video", deviceId: string) {
    const ns = await navigator.mediaDevices.getUserMedia({ [kind]: { deviceId: { exact: deviceId } } } as MediaStreamConstraints); const nt = ns.getTracks()[0];
    const old = this.local?.getTracks().find((t) => t.kind === kind); nt.enabled = kind === "audio" ? this.mic : this.cam;
    if (old) { this.local!.removeTrack(old); old.stop(); } this.local?.addTrack(nt);
    for (const p of this.peers.values()) { const sn = p.pc.getSenders().find((x) => x.track?.kind === kind); if (sn && !(kind === "video" && this.screen)) await sn.replaceTrack(nt); }
    this.o.onChange();
  }

  /** Screen share: swaps the outgoing video track (no renegotiation when a video sender exists). */
  async shareScreen(): Promise<boolean> {
    if (!navigator.mediaDevices.getDisplayMedia || this.screen) return false;
    try { this.screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch { return false; }
    const track = this.screen.getVideoTracks()[0]; track.onended = () => this.stopScreen();
    for (const p of this.peers.values()) { const s = p.pc.getSenders().find((x) => x.track?.kind === "video"); if (s) await s.replaceTrack(track); else p.pc.addTrack(track, this.screen); }
    this.sendState(); this.o.onChange(); return true;
  }
  async stopScreen() {
    if (!this.screen) return; this.screen.getTracks().forEach((t) => t.stop()); this.screen = null;
    const cam = this.local?.getVideoTracks()[0] ?? null;
    for (const p of this.peers.values()) { const s = p.pc.getSenders().find((x) => x.track?.kind === "video" || (!x.track && cam)); if (s) await s.replaceTrack(cam); }
    this.sendState(); this.o.onChange();
  }

  private async pollStats() {
    for (const p of this.peers.values()) {
      try {
        let rtt: number | null = null; let lost = 0, received = 0;
        (await p.pc.getStats()).forEach((r) => { if (r.type === "candidate-pair" && r.nominated && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime * 1000; if (r.type === "inbound-rtp") { lost += r.packetsLost ?? 0; received += r.packetsReceived ?? 0; } });
        const cur = { lost, received }; const q = qualityFromStats({ rttMs: rtt, lossPct: lossBetween(p.lastRx, cur) }); p.lastRx = cur;
        if (q !== p.quality) { p.quality = q; this.o.onChange(); }
      } catch { /* stats unavailable */ }
    }
  }
  views(): PeerView[] { return [...this.peers.values()].map(({ id, name, stream, mic, cam, screen, quality, connection }) => ({ id, name, stream, mic, cam, screen, quality, connection })); }

  leave() {
    if (this.closed) return; this.closed = true; if (this.timer) clearInterval(this.timer);
    this.o.sig.send({ type: "bye" }); this.o.sig.leave();
    this.peers.forEach((p) => p.pc.close()); this.peers.clear(); this.screen?.getTracks().forEach((t) => t.stop()); this.local?.getTracks().forEach((t) => t.stop());
  }
}
