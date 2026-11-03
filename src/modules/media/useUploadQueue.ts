"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/data";
import { nextToStart, type QueueItem } from "@/lib/media/helpers";
import { maybeOptimize, uploadWithProgress } from "./uploader";

interface Entry { file: File; ctrl?: AbortController }

/** Upload queue for one conversation: validate → upload (progress) → send as a message. Two at a time, cancellable, retryable. */
export function useUploadQueue(conversationId: string | undefined, opts: { original: boolean; replyTo?: string; onSent?: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const files = useRef(new Map<string, Entry>());
  const running = useRef(new Set<string>()); // guards against double-start (React strict-mode effects, rapid re-renders)
  const set = useCallback((id: string, p: Partial<QueueItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), []);
  const optsRef = useRef(opts); optsRef.current = opts;

  const add = useCallback((list: File[]) => {
    const fresh = list.map((file) => { const id = crypto.randomUUID(); files.current.set(id, { file }); return { id, name: file.name, size: file.size, progress: 0, status: "queued" as const }; });
    setItems((xs) => [...xs, ...fresh]);
  }, []);

  const run = useCallback(async (it: QueueItem) => {
    const e = files.current.get(it.id); if (!e || !conversationId || running.current.has(it.id)) return;
    running.current.add(it.id);
    e.ctrl = new AbortController(); set(it.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const file = await maybeOptimize(e.file, optsRef.current.original);
      const up = await uploadWithProgress(file, (p) => set(it.id, { progress: p }), e.ctrl.signal);
      set(it.id, { status: "sending" });
      const r = await api("/api/messages", "POST", { conversationId, kind: up.kind, body: it.name, mediaPath: up.path, meta: { name: it.name }, replyTo: optsRef.current.replyTo });
      if (r.error) throw new Error(r.error === "rate_limited" ? "Slow down a little." : "Couldn't send. Please retry.");
      set(it.id, { status: "done", progress: 100 }); files.current.delete(it.id); optsRef.current.onSent?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") set(it.id, { status: "canceled" });
      else set(it.id, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
    } finally { running.current.delete(it.id); }
  }, [conversationId, set]);

  // scheduler
  useEffect(() => { const n = nextToStart(items); if (n) run(n); }, [items, run]);

  return {
    items, add,
    cancel: (id: string) => { files.current.get(id)?.ctrl?.abort(); set(id, { status: "canceled" }); },
    retry: (id: string) => set(id, { status: "queued", progress: 0, error: undefined }),
    clearFinished: () => setItems((xs) => xs.filter((x) => x.status === "queued" || x.status === "uploading" || x.status === "sending")),
  };
}
