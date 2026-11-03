# Setup & deployment

## 1. Supabase
1. Create a project. In **SQL editor** run `supabase/migrations/0001_ocean_core.sql`, then `0002_social_core.sql` (or `supabase db push`).
2. **Auth → URL configuration**: set Site URL to your deployed URL and add `<site>/reset` to Redirect URLs (password reset).
3. **Auth → Providers → Email**: keep "Confirm email" on for production.
4. Storage: the migration creates the private `media` bucket. Files are only reachable through short-lived signed URLs minted by `/api/media` after an RLS check.
5. Copy URL, anon key and **service-role key** into the environment (below). The service-role key is used only in server code (`src/lib/supabase/server.ts`) and must never get a `NEXT_PUBLIC_` prefix.

## 2. Environment (`.env.local` / Vercel project settings)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
NEXT_PUBLIC_APP_NAME=OCEAN        # branding
NEXT_PUBLIC_APP_TAGLINE=Our world. Our conversations.
```

## 3. Deploy (Vercel)
Import the repo, add the env vars, deploy. `npm run build` must pass; `npm test` runs the unit suite.
Rate limiting is in-memory per server instance — on multi-instance/serverless production, swap `RateLimiter` storage for Redis/Upstash (`src/lib/security/rateLimit.ts`).

## 4. Features that need an external service (NOT configured yet)
| Feature | What's needed | Where it plugs in |
|---|---|---|
| Voice/video rooms, screen share | LiveKit Cloud (or self-hosted) — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; mint room tokens in an authenticated route after checking `conversation_members` | new `src/app/api/livekit/route.ts` + room UI |
| Background push (closed tab / mobile) | Service worker + VAPID keys (`web-push`), a `push_subscriptions` table; call from `notify()` when `decide().push` is true | `src/modules/notify/service.ts` |
| GIF search | Tenor or Giphy API key, proxied through a server route | chat composer |
| Resumable uploads for very large files | Supabase TUS endpoint (`/storage/v1/upload/resumable`) with `tus-js-client` | `/api/upload-url` already validates type/size/quota first |
| ML camera effects (segmentation, AR masks) | `@mediapipe/tasks-vision` models | `src/modules/camera/CameraStudio.tsx` |

## 5. Privacy model (read this before promising anything to users)
- Conversations are **private by access control** (Postgres Row Level Security), transported over TLS and stored on your Supabase project. They are **not end-to-end encrypted**: the server operator (you) and Supabase can technically read them. Do not describe the app as E2EE.
- Clients cannot write messages, moments, pets, streaks or XP directly — only the validated server routes can.
- Moment audience (friends / close friends / selected / only me / 24h expiry) and blocks are enforced by database policies, not the UI.
- Invite codes are random 192-bit values, stored hashed, single-use by default, and expire.
- Users can export their data (JSON) and delete their account (removes files and cascades rows) from Settings.
