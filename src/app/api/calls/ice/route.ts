import { authed } from "@/modules/progression/http";
import { turnCredentials } from "@/lib/calls/logic";

/**
 * ICE servers for WebRTC. STUN works for most home networks; strict NATs / corporate firewalls need TURN.
 * Configure STUN_URLS (comma-separated) and, for TURN, TURN_URLS + TURN_SECRET (coturn `use-auth-secret`).
 * Credentials are minted per user and expire in an hour.
 */
export const GET = () => authed(async ({ user }) => {
  const stun = (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302").split(",").map((s) => s.trim()).filter(Boolean);
  const servers: { urls: string[]; username?: string; credential?: string }[] = [{ urls: stun }];
  const turn = (process.env.TURN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (turn.length && process.env.TURN_SECRET) { const c = turnCredentials(process.env.TURN_SECRET, user.id, Math.floor(Date.now() / 1000)); servers.push({ urls: turn, username: c.username, credential: c.credential }); }
  return { iceServers: servers, turn: turn.length > 0 && !!process.env.TURN_SECRET };
});
