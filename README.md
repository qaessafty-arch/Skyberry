# 🌊 OCEAN — a little world for the people who matter

Private social app for friends: messaging, camera studio, Moments, and shared 3D pets that grow with the friendship.
Next.js 16 · React Three Fiber · Supabase (Postgres + RLS + Realtime + Storage).

## Run it
```bash
cp .env.example .env.local        # add your Supabase URL, anon key, service-role key
# apply supabase/migrations/0001_ocean_core.sql to your project (SQL editor or `supabase db push`)
npm run dev
npm test                          # progression, pet catalog, camera composition
```
No Supabase yet? `/lab` (the Pet Lab) works without any backend.

## Architecture
| Module | Where |
|---|---|
| Progression (streaks, XP, milestones, evolution, anti-spam) | `src/lib/progression/*` — pure, tested; `src/modules/progression/service.ts` persists |
| Pets (catalog, 3D models, stage) | `src/modules/pets/*` |
| Messaging, Moments UI, Media | `src/modules/social/*`, `src/app/(app)/{chats,moments}` |
| Camera (composition, warp, studio) | `src/modules/camera/*` |
| 3D Universe | `src/modules/social/UniverseScene.tsx` |
| Auth / DB | `src/lib/supabase/*`, `supabase/migrations` |
| API (server-validated writes) | `src/app/api/*` |

### Security model
- Clients **cannot** write messages, moments, pets, streaks, XP, or evolution (no RLS insert/update policies). All of that goes through `/api/*`, which verifies membership, uses the **server clock**, and is the only caller of the progression engine.
- Double-reveal partner photos are hidden by RLS until both have submitted. Media is private; signed URLs are only minted if RLS lets the caller see a row referencing the file.
- Pet accessories / homes can only be equipped if unlocked (validated server-side).

### Friendship rules (see `streak.ts`, `interactions.ts`)
- A day counts when **both** friends do something meaningful (a photo / voice / moment / challenge, or 3 non-spammy messages). Spam, duplicates and rapid-fire are rejected; XP is capped per kind per day.
- 2 missed days are forgiven; broken streaks restore for free within 7 days (once per 30). Evolution is based on longest streak and never regresses. No rankings; pets never die or get sad.
- Days roll over in the friendship's time zone.

## Status

See `docs/SETUP.md` for setup, deployment, optional services, security notes and the privacy model (the app is **not** end-to-end encrypted).

### Verified (automated)
- **97 unit tests**: progression, security helpers, upload policy, notification rules, group permissions, saved filters, media helpers, call logic (quality, TURN credentials), push payloads, sticker logic, camera composition/adjustments/recording plan, face geometry, chat-style sanitising.
- **Database (Postgres 16, Supabase stubs, migrations 0001–0005):** RLS for moments/audiences/expiry/blocks, sticker consent, group ownership, write-protected progression, call membership and private realtime-channel authorisation, atomic call join/leave.
- **Real browser (Chromium):** two-peer WebRTC call with audio/video both ways, mute/camera/screen-share signalling, quality indicator and leave handling; resumable (TUS) upload with pause/resume against a local TUS server; drag-and-drop/queue/cancel/retry; photo editor; MediaPipe segmentation and face tracking on a real portrait; photo and video capture, trim/filter/mute export; service-worker push handler and offline fallback; CSP sweep across all feature pages on a production build; web-push encryption/VAPID verified by decrypting at a mock push endpoint.

### Implemented but NOT exercised against a live Supabase project
Auth and password reset, realtime chat, notifications, invites, Moments, stickers, groups, Saved, gallery, calls' signalling over Supabase Realtime, TUS against Supabase Storage, and the bucket policies. Run the app against a real project and click through before relying on any of it. No Docker daemon was available here, so there was no local Supabase stack.

### Known limits and honest caveats
- Camera effects, face swap and "Surprise me" wallpapers are on-device image processing (the wallpapers are procedurally drawn, **not** AI-generated). Face swap is a similarity-aligned, feathered blend — a fun effect, not photorealistic.
- Video export re-records in real time (a 10 s clip takes ~10 s). Output is never upscaled, and quality labels reflect real pixels (a 4K sensor with effects on is recorded and labelled ≤720p).
- Calls: mesh topology (≤6 people); TURN recommended for strict networks.
- Push delivery to real devices, Tenor/Giphy responses, iOS-specific camera behaviour and 360° capture were not testable here (360° is not implemented).

### Not built
Pet racing / dance battle / treasure hunt and other mini-games beyond Truth or Dare, Would You Rather, trivia and polls; collaborative drawing and doodles; group pets (pets stay per-friendship by design); custom emoji as a separate system (use sticker packs); an SFU for large calls; native iOS/Android apps; i18n; message/file end-to-end encryption.
