"use client";
import { useEffect, useState } from "react";
import { signedUrl } from "@/lib/data";
export function Media({ path, alt, style }: { path: string; alt: string; style?: React.CSSProperties }) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => { let live = true; signedUrl(path).then((x) => live && setU(x)); return () => { live = false; }; }, [path]);
  return u ? <img src={u} alt={alt} style={{ width: "100%", borderRadius: 16, display: "block", ...style }} /> : <div className="glass" style={{ aspectRatio: "1", borderRadius: 16 }} aria-busy />;
}
