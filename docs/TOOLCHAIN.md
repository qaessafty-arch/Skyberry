# Toolchain

Status key: **Verified** = installed and run here · **Evaluated** = checked, not used · **Blocked** = could not be reached from this sandbox.

| Tool | Purpose | Status | Notes |
|---|---|---|---|
| Next.js 16, React 19, TypeScript | App | Verified | In use. |
| Three.js 0.187, React Three Fiber 9 | 3D | Verified | In use for procedural pets and background. |
| Drei | 3D helpers | Evaluated | Not installed; no current need. |
| `@mediapipe/tasks-vision` 1.2.2 | Face tracking, segmentation | Verified | Apache-2.0. Wasm self-hosted in `public/mediapipe`. |
| `@gltf-transform/*` 4.x, `meshoptimizer`, `draco3dgltf` | glTF optimisation | Verified (scratch dir) | CLI runs `optimize --compress meshopt`. Not added to the repo yet, because there are no assets to process. |
| Draco / KTX-Software / Meshoptimizer CLI | Compression | Partially verified | Draco and Meshopt via gltf-transform only. KTX-Software not installed. |
| Blender | Modelling, rigging, animation | Blocked | Not installed; blender.org unreachable. |
| Spector.js, Chrome DevTools | GPU profiling | Evaluated | Not run. |
| Playwright 1.x (node package, system Chromium) | Browser tests | Verified | Ad-hoc scripts, not a committed suite. |
| Lighthouse | Performance/accessibility | Evaluated | Not run. |
| Geist (`@fontsource-variable/geist` 5.3.0) | Typeface | Verified | OFL-1.1. Renders in Chromium. |
| Vitest 5 | Unit tests | Verified | 97 tests. |
| `tus-js-client` | Resumable uploads | Verified | Against a local TUS server. |
| `web-push` | Push | Verified | Encryption checked against a mock endpoint. |
| WebRTC (native) | Calls | Verified | Mesh, two Chromium peers. |
| LiveKit | SFU calls | Evaluated | Not integrated. Needed for rooms above six people. |
| Supabase (Postgres, RLS, Realtime, Storage) | Backend | Partially verified | Postgres RLS on a local Postgres 16 with stubs. Live project not tested. |
| Rive / Lottie / Motion / Framer Motion | Motion | Evaluated | Not used; CSS transitions only. |
| Figma / Penpot / Storybook | Design and component docs | Evaluated | Not used. |
| Poly Haven, ambientCG, Sketchfab, Kenney, Quaternius, Fab, BlenderKit, Mixamo, Cascadeur, Womp, Spline | Assets / tools | Blocked | Hosts unreachable from this sandbox (connection failed). Not evaluated further. |
| Khronos glTF-Sample-Models | Reference models | Evaluated | The Duck model is under the SCEA Shared Source License, which does not clearly permit redistribution, so it was rejected. |

## Installation decisions
- Added: Geist font, `web-push`, `tus-js-client`, `@mediapipe/tasks-vision`.
- Deliberately not added: any 3D asset library, Drei, LiveKit, Storybook. Each needs a concrete use first.
