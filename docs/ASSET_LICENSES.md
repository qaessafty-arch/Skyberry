# Asset licences

Scope: every third-party file that is in the repository or served by the app.

## Shipped in the repo or served at runtime
| File | Source | Licence | Verified |
|---|---|---|---|
| `public/mediapipe/wasm/*` | `@mediapipe/tasks-vision` 1.2.2 (npm) | Apache-2.0 (package `license` field) | Yes |
| `public/models/selfie_segmenter.tflite` | Google MediaPipe model bucket (`storage.googleapis.com/mediapipe-models`) | **Not verified.** Model-card licence not read; confirm before shipping. | No |
| `public/models/face_landmarker.task` | Same bucket | **Not verified.** Same as above. | No |
| `@fontsource-variable/geist` (Geist font) | npm | OFL-1.1 | Yes |
| `public/icon-192.png`, `public/icon-512.png` | Rendered in this repo from the 🌊 emoji glyph | **Not verified.** The glyph comes from the system emoji font. Replace with an original icon before release. | No |

## Not shipped
| File | Licence | Note |
|---|---|---|
| `public/portrait.jpg` | Google MediaPipe sample image | Gitignored; used only by the local effects lab. Do not ship. |

## Evaluated and rejected
| Asset | Reason |
|---|---|
| Khronos glTF Sample `Duck` | SCEA Shared Source License; redistribution not clearly allowed. |

## Asset manifest
No licensed 3D environment, prop, pet or texture assets are in the repository. The manifest is empty by design until assets are verified.

## Production rule
Third-party files must be hosted locally or on a CDN you control. Nothing is hotlinked, except the Tenor/Giphy GIF hosts, which serve user-chosen content through the allowlist in `src/lib/stickers/logic.ts`.
