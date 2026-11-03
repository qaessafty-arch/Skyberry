"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { displayStreak, type StreakState } from "@/lib/progression/streak";
import { dayKey } from "@/lib/progression/time";

export interface Profile { id: string; handle: string; display_name: string; tz: string; color: string }
export interface PetRow { id: string; species: string; name: string; personality: string; rarity: string; colors: { body: string; accent: string }; equipped: string[]; home: string; hunger: number; joy: number }
export interface Friend {
  friendshipId: string; status: "pending" | "accepted"; incoming: boolean; tz: string; other: Profile; conversationId: string | null;
  progress: { streak: StreakState; xp: number; unlocked: string[]; evolution: number } | null; pet: PetRow | null;
}

export function useMe() {
  const [me, setMe] = useState<Profile | null>(null);
  useEffect(() => { (async () => {
    const sb = supabase(); const { data: u } = await sb.auth.getUser(); if (!u.user) return;
    const { data } = await sb.from("profiles").select("*").eq("id", u.user.id).single(); setMe(data);
  })(); }, []);
  return me;
}

/** Everything about my friendships in four RLS-filtered reads. */
export function useFriends(me: Profile | null) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const reload = useCallback(async () => {
    if (!me) return; const sb = supabase();
    const { data: fs } = await sb.from("friendships").select("*");
    if (!fs) return setFriends([]);
    const others = fs.map((f) => (f.user_a === me.id ? f.user_b : f.user_a));
    const ids = fs.map((f) => f.id);
    const [{ data: ps }, { data: cs }, { data: pr }, { data: pets }] = await Promise.all([
      sb.from("profiles").select("*").in("id", others.length ? others : ["00000000-0000-0000-0000-000000000000"]),
      sb.from("conversations").select("id,friendship_id").in("friendship_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      sb.from("friend_progress").select("*").in("friendship_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      sb.from("pets").select("*").in("friendship_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    setFriends(fs.map((f) => {
      const o = f.user_a === me.id ? f.user_b : f.user_a;
      const prog = pr?.find((p) => p.friendship_id === f.id);
      return { friendshipId: f.id, status: f.status, incoming: f.status === "pending" && f.requested_by !== me.id, tz: f.tz, other: ps!.find((p) => p.id === o)!,
        conversationId: cs?.find((c) => c.friendship_id === f.id)?.id ?? null, progress: prog ?? null, pet: (pets?.find((p) => p.friendship_id === f.id) as PetRow) ?? null };
    }));
  }, [me]);
  useEffect(() => { reload(); }, [reload]);
  return { friends, reload };
}

export const streakView = (f: Friend) => f.progress ? displayStreak(f.progress.streak, dayKey(new Date(), f.tz)) : { value: 0, status: "none" as const };

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T & { error?: string }> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

export async function signedUrl(path: string): Promise<string | null> {
  const r = await fetch(`/api/media?path=${encodeURIComponent(path)}`); if (!r.ok) return null; return (await r.json()).url ?? null;
}

/** Upload a Blob to the caller's own storage folder; returns the object path. */
export async function uploadMedia(blob: Blob, ext = "jpg"): Promise<string> {
  const sb = supabase(); const { data: u } = await sb.auth.getUser();
  const path = `${u.user!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("media").upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (error) throw error; return path;
}

const REASONS: Record<string, string> = { blocked_type: "That file type isn't allowed.", unsupported_type: "Unsupported file type.", too_large: "That file is too large.", empty: "That file is empty.", no_extension: "The file needs an extension.", quota_exceeded: "You're out of storage space." };
/** Upload through the server-validated path (type, size and quota are checked BEFORE bytes move). Throws a friendly message on rejection. */
export async function uploadValidated(file: File): Promise<{ path: string; kind: "image" | "video" | "audio" | "file" }> {
  const r = await api<{ ok: boolean; reason?: string; path: string; token: string; kind: "image" | "video" | "audio" | "file" }>("/api/upload-url", "POST", { name: file.name, type: file.type, size: file.size });
  if (r.error === "rate_limited") throw new Error("Slow down a little — too many uploads.");
  if (!r.ok) throw new Error(REASONS[r.reason ?? ""] ?? "Upload not allowed.");
  const { error } = await supabase().storage.from("media").uploadToSignedUrl(r.path, r.token, file, { contentType: file.type });
  if (error) throw new Error("Upload failed. Please retry.");
  return { path: r.path, kind: r.kind };
}
