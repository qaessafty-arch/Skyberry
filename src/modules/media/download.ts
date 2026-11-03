/** Reads a fetch Response body to a Blob while reporting 0–100 progress (null total → indeterminate, reported as -1). */
export async function readWithProgress(res: Response, onProgress: (pct: number) => void): Promise<Blob> {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) return res.blob();
  const reader = res.body.getReader(); const parts: Uint8Array<ArrayBuffer>[] = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value as Uint8Array<ArrayBuffer>); got += value.length; onProgress(total ? Math.min(99, Math.round((got / total) * 100)) : -1);
  }
  onProgress(100);
  return new Blob(parts, { type: res.headers.get("content-type") ?? "application/octet-stream" });
}

/** Download a (signed) URL with progress, then hand the bytes to the browser as a file save. */
export async function downloadWithProgress(url: string, filename: string, onProgress: (pct: number) => void, signal?: AbortSignal) {
  const res = await fetch(url, { signal }); if (!res.ok) throw new Error("Download failed");
  const blob = await readWithProgress(res, onProgress);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
