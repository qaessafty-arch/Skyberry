# Repository audit

Date: 2026-11-04. Branch `ccr-965e68ce-ybe08b` (13 commits, clean tree).

## Architecture (verified in the repo)
- **Framework:** Next.js 16 (App Router), React 19, TypeScript, Vitest.
- **Backend:** Supabase (Postgres, RLS, Realtime, Storage, Auth) via `@supabase/ssr` and `@supabase/supabase-js`. Server routes under `src/app/api/*` use the service-role client only on the server (`server-only`).
- **3D:** `three` 0.187 and `@react-three/fiber` 9. Used for the pet stage, the Ocean Universe and the background. **No GLB/GLTF is loaded anywhere** (`GLTFLoader`/`useGLTF` are absent). All models are procedural geometry in code.
- **Camera / AR:** `@mediapipe/tasks-vision` (self-hosted wasm and models), browser `getUserMedia`, `MediaRecorder`, Canvas 2D.
- **Calls:** WebRTC mesh, signalled through a private Supabase Realtime channel. LiveKit is **not** used.
- **Push:** `web-push` (VAPID), service worker in `public/sw.js`.
- **Upload:** server-validated signed URLs; TUS (`tus-js-client`) above 6 MB.
- **Design system:** hand-written CSS custom properties in `src/app/globals.css`; no component library.
- **Tests:** Vitest unit tests (97). No Playwright suite is committed; browser checks were ad-hoc scripts run with the Playwright package in a scratch directory.
- **Deployment:** no Vercel config committed; `docs/SETUP.md` describes manual setup.

## 1. Already works (verified)
- Typecheck, 97 unit tests, production build (run this session).
- Progression engine, anti-spam, time-zone day rollover (unit tests).
- Postgres RLS for messages, moments, stickers, groups, calls (run on Postgres 16 with Supabase stubs).
- Two-peer WebRTC call with media both ways (Chromium, fake devices).
- Resumable upload against a local TUS server; queue, cancel, retry (Chromium).
- Photo capture and video recording with real output sizes; trim/filter/mute export (Chromium).
- MediaPipe segmentation and face tracking on a test portrait (Chromium).
- Service-worker push parsing and offline fallback; web-push encryption (mock endpoint).

## 2. Incomplete
- Supabase features have not been exercised against a live project (no Docker here).
- Pet homes are a colour gradient (`HOME_BG` in `PetStage.tsx`), not 3D environments; decoration is not implemented.
- Ocean Universe friends are spheres; the "islands/planets" the spec describes are not modelled.
- Moments "Memory replay" is a grid, not a visual recap.
- Friend challenges (spec §11) are not implemented.

## 3. Broken or unverified
- No known broken features from the last test runs. The following are unverified in a browser at all: pet care/customisation flows, group admin UI, Saved page UI, invite redemption, password reset.
- Camera test runs used a fake 720p camera and software GL; real-device behaviour and performance are unmeasured.

## 4. Should improve
- Replace procedural pets with authored GLB models and skeletal animation (see `docs/3D_PIPELINE.md`).
- Add a Playwright regression suite instead of ad-hoc scripts.
- Lighthouse and accessibility audits have not been run.
- The `README.md` status section is long; keep `IMPLEMENTATION_STATUS.md` as the source of truth.

## 5. Missing dependencies
- No licensed 3D environment, pet or prop assets are in the repo (see `docs/ASSET_LICENSES.md`).
- Blender is not installed here and cannot be downloaded from this sandbox.
- Typeface: now Geist (`@fontsource-variable/geist`, OFL-1.1).

## 6. Reusable
- Progression, moderation and permission logic (`src/lib/*`) is framework-independent and tested.
- Procedural pet rig (`src/modules/pets/Pet3D.tsx`) is a usable starting point for the GLB rig.
- Camera pipeline (`src/modules/camera/*`) and call engine (`src/modules/calls/*`).

## 7. Must be implemented (in priority order)
1. Live verification of the Supabase flows (auth, chat, Moments, uploads) against a real project.
2. Licensed 3D assets and GLB pets; a pet home built from real assets.
3. A Playwright suite covering the core flows, plus Lighthouse runs.
4. Missing spec tables: `pet_ownership`, `pet_customizations`, `pet_environments`, `friendship_streaks`, `friendship_milestones`, `pet_interactions`, `daily_challenges`, `rooms`, `room_members`, `attachments`, `saved_messages`. Current equivalents live in `pets`, `friend_progress`, `saved_items`, `conversations` and `messages`.
