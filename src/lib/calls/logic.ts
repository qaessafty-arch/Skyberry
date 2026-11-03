import { createHmac } from "node:crypto";

export const MAX_MESH_PARTICIPANTS = 6; // full-mesh WebRTC; beyond this an SFU (e.g. LiveKit) is the right tool

export type Quality = "good" | "fair" | "poor";
export function qualityFromStats(s: { rttMs: number | null; lossPct: number | null }): Quality {
  const rtt = s.rttMs ?? 0, loss = s.lossPct ?? 0;
  if (rtt < 150 && loss < 2) return "good";
  if (rtt < 300 && loss < 6) return "fair";
  return "poor";
}
/** Packet-loss % over an interval from two cumulative samples. */
export function lossBetween(prev: { lost: number; received: number } | null, cur: { lost: number; received: number }): number | null {
  if (!prev) return null;
  const lost = cur.lost - prev.lost, recv = cur.received - prev.received, total = lost + recv;
  return total > 0 ? Math.max(0, (lost / total) * 100) : null;
}

/** Perfect-negotiation role: exactly one side of every pair is "polite" (yields on offer collision). */
export const isPolite = (selfId: string, remoteId: string) => selfId > remoteId;

/**
 * Time-limited TURN credentials (coturn `use-auth-secret` / REST API scheme):
 * username = "<expiry>:<userId>", credential = base64(HMAC-SHA1(secret, username)).
 */
export function turnCredentials(secret: string, userId: string, nowSec: number, ttlSec = 3600) {
  const username = `${nowSec + ttlSec}:${userId}`;
  return { username, credential: createHmac("sha1", secret).update(username).digest("base64"), ttlSec };
}

export type CallRoomType = "text" | "voice" | "video" | "daily" | "gaming" | "music" | "study" | "meme" | "temporary" | "private";
/** Rooms where an audio/video call makes sense by default (DMs and all group rooms may still start one). */
export const callMode = (t: CallRoomType): "audio" | "video" => (t === "video" || t === "daily" ? "video" : "audio");
