"use client";
import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

let filesetP: Promise<unknown> | null = null;
let segP: Promise<ImageSegmenter | null> | null = null;
const lmP: Partial<Record<"VIDEO" | "IMAGE", Promise<FaceLandmarker | null>>> = {};

async function fileset() {
  const { FilesetResolver } = await import("@mediapipe/tasks-vision");
  return (filesetP ??= FilesetResolver.forVisionTasks("/mediapipe/wasm")) as Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>>;
}
/** Models are optional downloads (see scripts/setup-vision.mjs). Effects simply stay off if they're missing. */
export async function modelsPresent(): Promise<boolean> {
  try { const [a, b] = await Promise.all([fetch("/models/selfie_segmenter.tflite", { method: "HEAD" }), fetch("/models/face_landmarker.task", { method: "HEAD" })]); return a.ok && b.ok; } catch { return false; }
}

/** GPU first, CPU fallback — weak devices and some browsers lack the WebGL features MediaPipe wants. */
export function getSegmenter(): Promise<ImageSegmenter | null> {
  return (segP ??= (async () => {
    try {
      const { ImageSegmenter } = await import("@mediapipe/tasks-vision"); const fs = await fileset() as never;
      for (const delegate of ["GPU", "CPU"] as const) {
        try { return await ImageSegmenter.createFromOptions(fs, { baseOptions: { modelAssetPath: "/models/selfie_segmenter.tflite", delegate }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false }); } catch { /* try next delegate */ }
      }
    } catch { /* unavailable */ }
    return null;
  })());
}
export function getLandmarker(mode: "VIDEO" | "IMAGE" = "VIDEO"): Promise<FaceLandmarker | null> {
  return (lmP[mode] ??= (async () => {
    try {
      const { FaceLandmarker } = await import("@mediapipe/tasks-vision"); const fs = await fileset() as never;
      for (const delegate of ["GPU", "CPU"] as const) {
        try { return await FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate }, runningMode: mode, numFaces: 3, outputFaceBlendshapes: false }); } catch { /* try next */ }
      }
    } catch { /* unavailable */ }
    return null;
  })());
}

/** Person mask for a canvas/image as a Float32 confidence map (0..1) plus its size, or null. */
export async function personMask(src: HTMLCanvasElement | HTMLImageElement | ImageBitmap): Promise<{ data: Float32Array; w: number; h: number } | null> {
  const seg = await getSegmenter(); if (!seg) return null;
  const r = seg.segment(src as HTMLCanvasElement); const m = r.confidenceMasks?.[0]; if (!m) { r.close(); return null; }
  const out = { data: new Float32Array(m.getAsFloat32Array()), w: m.width, h: m.height }; r.close(); return out;
}

let lastTs = 0;
/** The video-mode detector is a stateful stream: timestamps must strictly increase across ALL callers sharing it. */
export function monotonicTs(now: number): number { lastTs = Math.max(lastTs + 1, Math.round(now)); return lastTs; }
