# QA report

Date: 2026-11-04. Results from this session plus earlier runs in this branch.

## Automated checks (run this session)
| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `vitest run` (11 files, 97 tests) | Pass |
| `next build` (production) | Compiled; static generation completed |

## Browser checks (ad-hoc Playwright scripts; Chromium with fake devices)
| Area | Result | When |
|---|---|---|
| Landing page renders with Geist | Pass | This session |
| Content-Security-Policy, production build, 7 pages | 0 violations | Earlier |
| Two-peer call (audio and video both ways, mute, camera off, screen share, leave) | Pass | Earlier |
| Resumable upload (pause, resume, finish against a local TUS server) | Pass | Earlier |
| Upload queue (concurrency 2, cancel, retry, disallowed type rejected) | Pass | Earlier |
| Photo editor (brightness, filter, crop, draw, undo, export) | Pass | Earlier |
| Camera: photo, video, trim, mute export | Pass (five runs) | Earlier |
| Camera: effects inside the Studio | Pass for capture; preview not visually reviewed | Earlier |
| Service worker push parsing, offline page | Pass | Earlier |

## Not tested
- Any flow that needs a live Supabase project: sign-up, sign-in, password reset, realtime chat, notifications, friend requests, invites, Moments, stickers, groups, Saved, the gallery, the call signalling over Realtime, storage policies.
- Mobile viewports on real devices.
- Accessibility (screen reader, keyboard-only, contrast).
- Offline behaviour beyond the offline page.
- Pet care and customisation flows.

## Defects found and fixed in this branch
- Calls: the lobby stopped tracks that had been handed to the call, so no media was sent.
- Camera: Retake left a black preview (the camera was not re-acquired).
- Camera: effects upscaled output beyond the real crop.
- Video export: the trim loop rewound the recording during export.
- Upload: `pause`/`resume` status was missing from the queue type.
