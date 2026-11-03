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

See `docs/SETUP.md` for setup, deployment, the privacy model, and which features need external services.

**Verified in this repo:** 44 unit tests (progression, security helpers, upload policy, notification rules, camera composition/adjustments, style sanitising); both migrations apply on Postgres 16 and RLS behaviour was tested (moment audiences, 24h expiry, blocks, viewer lists, role escalation, saved-item restrictions, double reveal, write protection); production build; Chromium checks of the 3D ocean background, the 10 pet species, and the photo editor (brightness/filters/crop/draw/undo/export change real pixels, no upscaling).

**Implemented but not yet exercised end-to-end against a live Supabase project:** auth + password reset, profiles, friend requests/removal/blocking, invite links, realtime chat (reply, edit, delete, forward, reactions, receipts, typing, search, pagination, pins, private saves, retry), notifications (in-app + foreground browser), per-chat customization, Moments (24h stories, audiences, viewer, reactions, private replies, report), camera → edit → share, pets, account export/delete.

**Added since:** Saved page (search, type filters, collections, notes, links, validated file upload, sort) and Group admin (settings, announcement, admins-only posting, roles, add/remove, ownership transfer, invites, leave/delete). Permission rules live in `src/lib/groups/permissions.ts` and are enforced by `/api/groups/[id]`; migration `0003_group_admin.sql` adds the columns and a one-owner-per-group index. These screens are type-checked and built but not yet clicked through against live Supabase data.

**Not built:** voice/video rooms (LiveKit), background push, GIF search, resumable uploads, video recording/editing, MediaPipe effects (segmentation, AR masks, face swap), custom sticker packs, polls UI beyond the basic poll, media gallery, drag-and-drop uploads, location sharing, i18n. A mobile-specific navigation exists (bottom bar) but swipe gestures are not implemented.
