"use client";
import { useEffect } from "react";

/** Horizontal swipe detection (ignores mostly-vertical drags and short flicks). Pure core is exported for tests. */
export function swipeDirection(dx: number, dy: number, minDist = 60): "left" | "right" | null {
  if (Math.abs(dx) < minDist || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "left" : "right";
}
export function useSwipe(el: React.RefObject<HTMLElement | null>, h: { onLeft?: () => void; onRight?: () => void }) {
  useEffect(() => {
    const node = el.current; if (!node) return; let sx = 0, sy = 0;
    const start = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
    const end = (e: TouchEvent) => { const d = swipeDirection(e.changedTouches[0].clientX - sx, e.changedTouches[0].clientY - sy); if (d === "left") h.onLeft?.(); if (d === "right") h.onRight?.(); };
    node.addEventListener("touchstart", start, { passive: true }); node.addEventListener("touchend", end, { passive: true });
    return () => { node.removeEventListener("touchstart", start); node.removeEventListener("touchend", end); };
  }, [el, h.onLeft, h.onRight]); // eslint-disable-line react-hooks/exhaustive-deps
}
