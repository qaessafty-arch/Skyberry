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

## Status — what's real and what isn't
**Working (verified):** progression engine + 29 unit tests; migration applies cleanly and RLS behaves as designed (tested on Postgres 16 with Supabase stubs); production build; 10 procedural 3D species with moods, personalities, accessories, 5 evolution stages, low-power / reduced-motion modes (rendered and checked in Chromium).

**Written but not exercised end-to-end** (needs a real Supabase project + two accounts): auth, realtime chat, moments, double reveal, camera → share, pet care/customization, rooms.

**Not built yet:** voice/video rooms (needs WebRTC/SFU), face swap, 360° capture, animated 3D AR face effects, GIF search, drawing/doodles, most mini-games (Would You Rather, polls, secret and surprise messages exist; Truth or Dare, trivia, pet racing, etc. do not), pet group chats (pets are per-friendship), custom-creature editor beyond color/accessories, push notifications/reminders, collaborative decorating of pet homes with items.

**Honest caveats:** pets are procedurally modelled in code (no GLB/Blender assets, so no skeletal-mesh rigs — animation is a hierarchical rig); face effects are a 2D lens warp (uses the browser FaceDetector where available, otherwise center-weighted); composition tips need that API (Chromium).
