"use client";
import { useCallback, useSyncExternalStore } from "react";

export interface Prefs { reducedMotion: boolean; lowPower: boolean; universe3d: boolean; /** auto = on unless the device looks weak */ bg: "auto" | "on" | "off"; bgIntensity: number }
const KEY = "ocean.prefs";
const DEFAULTS: Prefs = { reducedMotion: false, lowPower: false, universe3d: true, bg: "auto", bgIntensity: 0.6 };

// One shared store so the background, settings and pages all see the same values instantly.
let state: Prefs = DEFAULTS; let loaded = false; const subs = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return; loaded = true;
  let saved: Partial<Prefs> = {}; try { saved = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { /* ignore */ }
  const mq = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4 || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 2;
  state = { ...DEFAULTS, reducedMotion: mq, lowPower: weak, ...saved };
}
const subscribe = (cb: () => void) => { subs.add(cb); return () => subs.delete(cb); };
const snap = () => { load(); return state; };

export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, snap, () => DEFAULTS);
  const update = useCallback((p: Partial<Prefs>) => { state = { ...snap(), ...p }; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } subs.forEach((f) => f()); }, []);
  return [prefs, update];
}

/** Should the 3D background render at all, and at what level? Pure so it can be tested. */
export function backgroundMode(p: Pick<Prefs, "bg" | "reducedMotion" | "lowPower">): "off" | "lite" | "full" {
  if (p.bg === "off") return "off";
  if (p.reducedMotion) return "lite";       // static frame, no animation
  if (p.bg === "auto" && p.lowPower) return "lite";
  return "full";
}
