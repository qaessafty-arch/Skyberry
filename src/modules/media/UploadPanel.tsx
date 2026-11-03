"use client";
import { formatBytes, overallProgress } from "@/lib/media/helpers";
import type { useUploadQueue } from "./useUploadQueue";

/** Progress list for the upload queue: per-file bars, cancel while active, retry after failure. */
export function UploadPanel({ uploads }: { uploads: ReturnType<typeof useUploadQueue> }) {
  if (!uploads.items.length) return null;
  return (
    <div className="glass card" style={{ display: "grid", gap: 6, padding: 10 }} aria-label="Uploads">
      <div className="row" style={{ justifyContent: "space-between" }}><b>Uploads · {overallProgress(uploads.items)}%</b><button className="btn ghost" style={{ padding: ".1em .6em" }} onClick={uploads.clearFinished}>Clear finished</button></div>
      {uploads.items.map((u) => (
        <div key={u.id} data-status={u.status}>
          <div className="row" style={{ justifyContent: "space-between", fontSize: ".85rem" }}>
            <span style={{ wordBreak: "break-all" }}>{u.name} <span className="muted">{formatBytes(u.size)}</span></span>
            <span>{u.status === "done" ? "✓ Sent" : u.status === "canceled" ? "Canceled" : u.status === "error" ? <span style={{ color: "#d6336c" }}>{u.error}</span> : u.status === "sending" ? "Sending…" : u.status === "queued" ? "Waiting…" : `${u.progress}%`}
              {(u.status === "uploading" || u.status === "queued") && <button className="btn ghost" style={{ padding: ".05em .5em", marginLeft: 6 }} onClick={() => uploads.cancel(u.id)} aria-label={`Cancel ${u.name}`}>✕</button>}
              {(u.status === "error" || u.status === "canceled") && <button className="btn ghost" style={{ padding: ".05em .5em", marginLeft: 6 }} onClick={() => uploads.retry(u.id)}>Retry</button>}</span>
          </div>
          <div style={{ height: 4, borderRadius: 9, background: "var(--line)" }} role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${u.name} upload`}><div style={{ width: `${u.progress}%`, height: "100%", borderRadius: 9, background: u.status === "error" ? "#d6336c" : "linear-gradient(90deg,var(--blue),var(--cyan))" }} /></div>
        </div>))}
    </div>
  );
}
