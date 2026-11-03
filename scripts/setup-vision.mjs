// Self-hosts MediaPipe: copies the wasm runtime from node_modules and downloads the model files. Non-fatal if offline.
import { cpSync, existsSync, mkdirSync, createWriteStream, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const wasmSrc = "node_modules/@mediapipe/tasks-vision/wasm";
if (existsSync(wasmSrc)) { mkdirSync("public/mediapipe", { recursive: true }); cpSync(wasmSrc, "public/mediapipe/wasm", { recursive: true }); console.log("mediapipe wasm → public/mediapipe/wasm"); }

const MODELS = {
  "selfie_segmenter.tflite": "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
  "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
};
mkdirSync("public/models", { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dest = `public/models/${name}`;
  if (existsSync(dest) && statSync(dest).size > 1000) continue;
  try { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); await pipeline(Readable.fromWeb(r.body), createWriteStream(dest)); console.log("model →", dest); }
  catch (e) { console.warn(`Could not download ${name} (${e.message}). Camera effects stay disabled until you run: npm run setup:vision`); }
}
