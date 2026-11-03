"use client";
import { useEffect, useState, useCallback } from "react";

export interface Prefs { reducedMotion: boolean; lowPower: boolean; universe3d: boolean }
const KEY = "ocean.prefs";

export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>({ reducedMotion: false, lowPower: false, universe3d: true });
  useEffect(() => {
    let saved: Partial<Prefs> = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { /* ignore */ }
    const mq = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const weak = typeof navigator !== "undefined" && ((navigator.hardwareConcurrency ?? 8) <= 4);
    setPrefs({ reducedMotion: saved.reducedMotion ?? mq, lowPower: saved.lowPower ?? weak, universe3d: saved.universe3d ?? true });
  }, []);
  const update = useCallback((p: Partial<Prefs>) => setPrefs((cur) => { const n = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  return [prefs, update];
}
