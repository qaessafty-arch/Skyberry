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

## 4. Optional services and what they unlock
| Feature | Setup | Notes |
|---|---|---|
| **Camera effects** (background blur/replace, AR masks, face-centred distortion, face swap, sticker cut-outs) | `npm run setup:vision` (runs automatically on `npm install`) | Copies the MediaPipe wasm runtime to `public/mediapipe` and downloads two model files (~4 MB) to `public/models` from Google's public model bucket. Everything is self-hosted at runtime. Effects stay off if the models are missing. |
| **Voice/video calls** | none for small groups; **TURN recommended** | Calls are peer-to-peer WebRTC (full mesh, up to 6 people) signalled over a private Supabase Realtime channel (policies in migration 0005 — make sure Realtime *Authorization* is enabled for your project). STUN works for most home networks; strict NATs/firewalls need TURN: run [coturn](https://github.com/coturn/coturn) with `use-auth-secret`, then set `TURN_URLS` and `TURN_SECRET`. For rooms larger than 6, replace the mesh with an SFU such as LiveKit. |
| **Background push** | `npm run vapid`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Content-free payloads (sender + event only). iOS requires the app to be added to the Home Screen first. |
| **GIF search** | `TENOR_API_KEY` *or* `GIPHY_API_KEY` | Proxied server-side; results restricted to Tenor/Giphy hosts. |
| **Resumable uploads** | none | Files above 6 MB use Supabase's TUS endpoint automatically. Bucket-level size/type limits are applied by migration 0005. |

## 5. Security notes
- A Content-Security-Policy and standard headers are set in `next.config.ts` (CSP verified to produce zero violations across camera, MediaPipe, calls, uploads and sign-in pages). Next.js needs `'unsafe-inline'` for scripts unless you move to nonces.
- If you change your Supabase project URL, rebuild: the CSP is generated from `NEXT_PUBLIC_SUPABASE_URL`.

## 6. Privacy model (read this before promising anything to users)
- Conversations are **private by access control** (Postgres Row Level Security), transported over TLS and stored on your Supabase project. They are **not end-to-end encrypted**: the server operator (you) and Supabase can technically read them. Do not describe the app as E2EE.
- Clients cannot write messages, moments, pets, streaks or XP directly — only the validated server routes can.
- Moment audience (friends / close friends / selected / only me / 24h expiry) and blocks are enforced by database policies, not the UI.
- Invite codes are random 192-bit values, stored hashed, single-use by default, and expire.
- Users can export their data (JSON) and delete their account (removes files and cascades rows) from Settings.
