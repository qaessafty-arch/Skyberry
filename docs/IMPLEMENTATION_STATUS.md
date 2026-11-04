# Implementation status

Last updated 2026-11-04. This file is the source of truth. Anything not listed as **Done** is not done.

## Done and verified
- Messaging (direct and group): send, reply, edit, delete, forward, reactions, pins, private saves, receipts, typing, search, pagination, retry. Unit-tested logic; not verified against live Supabase.
- Friend requests, blocking, invite links (hashed, single-use by default).
- Progression: streaks with grace, restoration, milestones, evolution, anti-spam. Unit-tested and verified on Postgres.
- Row-level security for messages, moments, stickers, groups, calls, saved items and realtime channels. Verified on Postgres 16 with Supabase stubs.
- Calls: mesh WebRTC for up to six people, screen share, device switching, missed-call notifications. Verified with two Chromium peers.
- Uploads: validated signed URLs, queue, resumable uploads above 6 MB, bucket limits (migration 0005).
- Camera: photo, video, trim/cover/volume/filter export, honest quality labels. Verified in Chromium.
- Camera effects: background blur and replacement, AR masks, face-centred distortion, consent-gated face swap. Verified on one portrait.
- Stickers with consent for people in the photo. Verified on Postgres.
- Push notifications: VAPID, content-free payloads, service worker. Payload parsing and encryption verified; delivery to real devices not tested.
- Security: CSP and standard headers; zero violations across the feature pages.
- Typeface: Geist, verified in Chromium.

## Partly done
- Pets: procedural 3D species with moods and personalities, but no GLB models or skeletal animation.
- Pet homes: a background colour per home, not a 3D environment. No decoration.
- Ocean Universe: a 3D scene with spheres, plus a 2D list. Not islands or planets.
- Moments: stories, audiences, reactions, private replies; the recap is a grid, not a replay.
- Mini-games: Truth or Dare, Would You Rather, trivia, polls. The others from the spec are not built.
- Design: one consistent system, not distinct per-section identities.
- Performance: adaptive modes exist; no device measurements.

## Not built
- Licensed 3D assets, GLB pets, Blender-authored animation.
- 3D pet environments with decoration; the "pet world" screen.
- Friend challenges (spec §11).
- Memory replay as a visual recap.
- Games: pet racing, pet dance battle, treasure hunt, meme battle, emoji guessing, guess the photo, drawing challenge, friendship quiz, who knows me better.
- Shared doodles and collaborative drawings.
- LiveKit or SFU calls for more than six people.
- Playwright regression suite; Lighthouse; Spector.js profiling.
- Spec tables: `pet_ownership`, `pet_customizations`, `pet_environments`, `friendship_streaks`, `friendship_milestones`, `pet_interactions`, `daily_challenges`, `rooms`, `room_members`, `attachments`, `saved_messages`.
- Native iOS and Android apps.
- Dark mode toggle and reviewed dark palette.
- Safe-area handling.
- Accessibility audit.

## Blocked outside this repo
- Asset libraries (Poly Haven, ambientCG, Sketchfab, Kenney, Quaternius, Fab, BlenderKit) and tools (Blender, Mixamo, Cascadeur, Womp, Spline): unreachable from this sandbox.
- Live Supabase: needs a project and credentials.
- Real-device testing: needs phones.
