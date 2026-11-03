"use client";
import { useEffect, useRef, useState } from "react";
/** True once the element has scrolled near the viewport (then stays true) — used to defer signed-URL fetches and decoding. */
export function useVisible<T extends HTMLElement>(margin = "200px") {
  const ref = useRef<T>(null); const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el); return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}
