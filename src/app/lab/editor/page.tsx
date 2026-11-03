"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Shot } from "@/modules/camera/CameraStudio";

const Editor = dynamic(() => import("@/modules/camera/Editor").then((m) => m.Editor), { ssr: false });

/** Backend-free sandbox of the photo editor using a generated test image (or your own upload). */
export default function EditorLab() {
  const [shot, setShot] = useState<Shot | null>(null); const [out, setOut] = useState<Shot | null>(null);
  async function fromCanvas() {
    const c = document.createElement("canvas"); c.width = 1600; c.height = 1200; const x = c.getContext("2d")!;
    const g = x.createLinearGradient(0, 0, 1600, 1200); g.addColorStop(0, "#0a84ff"); g.addColorStop(0.5, "#7cc8ff"); g.addColorStop(1, "#19e3ff"); x.fillStyle = g; x.fillRect(0, 0, 1600, 1200);
    x.fillStyle = "#ff8fb1"; x.beginPath(); x.arc(500, 600, 220, 0, 7); x.fill(); x.fillStyle = "#1c3b66"; x.fillRect(900, 300, 400, 500);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png")); setShot({ blob, url: URL.createObjectURL(blob), w: 1600, h: 1200 });
  }
  useEffect(() => { fromCanvas(); }, []);
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 16 }}>
      <h1>Photo editor lab</h1>
      {out ? <div className="glass card"><img src={out.url} alt="Result" style={{ width: "100%", borderRadius: 14 }} data-testid="result" /><p className="muted">Exported {out.w}×{out.h}</p><button className="btn" onClick={() => setOut(null)}>Edit again</button></div>
        : shot && <Editor shot={shot} onBack={fromCanvas} onDone={setOut} />}
    </main>
  );
}
