"use client";
import { useRef, useState } from "react";
import { UploadPanel } from "@/modules/media/UploadPanel";
import { useUploadQueue } from "@/modules/media/useUploadQueue";

/** Backend-free sandbox for the drop zone + upload queue (tests intercept the network calls). */
export default function UploadsLab() {
  const [original, setOriginal] = useState(false); const [drag, setDrag] = useState(false); const depth = useRef(0); const [sent, setSent] = useState(0);
  const uploads = useUploadQueue("00000000-0000-0000-0000-000000000001", { original, onSent: () => setSent((n) => n + 1) });
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>
      <h1>Upload lab</h1>
      <div data-testid="zone" className="glass card" style={{ minHeight: 160, display: "grid", placeItems: "center", position: "relative", outline: drag ? "3px dashed var(--blue)" : undefined }}
        onDragEnter={(e) => { e.preventDefault(); depth.current++; setDrag(true); }} onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); depth.current = 0; setDrag(false); uploads.add(Array.from(e.dataTransfer.files)); }}>
        {drag ? "Drop to upload" : "Drag files here"}
        <label className="btn ghost">Choose<input data-testid="picker" type="file" multiple hidden onChange={(e) => { uploads.add(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
      </div>
      <label className="chip"><input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} style={{ width: "auto" }} /> Original quality</label>
      <p data-testid="sent">sent:{sent}</p>
      <UploadPanel uploads={uploads} />
    </main>
  );
}
