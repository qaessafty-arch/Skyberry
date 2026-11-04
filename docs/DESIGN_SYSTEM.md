# Design system (as implemented)

Source of truth: `src/app/globals.css`.

## Colour tokens (`:root`)
| Token | Value | Use |
|---|---|---|
| `--blue` | #0a84ff | Primary action, active states |
| `--sky` | #7cc8ff | Secondary |
| `--cyan` | #19e3ff | Accent, gradient end |
| `--navy` | #06223f | Deep surfaces |
| `--ink` | #0b2a4a | Text |
| `--bg` | #eaf6ff | Page background (ice blue, not pure white) |
| `--glass` | rgba(255,255,255,.72) | Glass surfaces |
| `--line` / `--muted` / `--shadow` | — | Borders, secondary text, elevation |

Dark mode is defined under `prefers-color-scheme: dark`. There is **no** manual dark-mode toggle yet, and the spec's "deep ocean navy" dark palette has not been reviewed for contrast.

## Typography
- One family: **Geist Variable** (`--font-ui`), OFL-1.1, loaded through Fontsource.
- Base 16 px / 1.45. Headings use tight letter-spacing (−0.01em).

## Shape, depth, motion
- Cards and inputs: 12–22 px radius; glass panels use `backdrop-filter` with a fallback.
- Buttons: a gradient primary and a ghost secondary; `.btn:active` scales to 0.97.
- Reduced motion: `.reduced` class disables animation and transitions. Enabled from user prefs and `prefers-reduced-motion`.

## Breakpoints
- Desktop: three-panel `.shell` / `.chat` grids.
- ≤760 px: bottom navigation, single-pane chat with swipe-back (`useSwipe`), safe-area padding not yet handled.

## Components
Plain React components in `src/modules/*`. No Storybook.

## Known gaps against the spec
- Layouts are not yet distinct per section. Chat, Moments and Camera share the same glass-card language.
- Asymmetric or editorial compositions have not been designed.
- Motion is not yet designed as a system; there are no Rive or Lottie assets.
- Safe-area insets (`env(safe-area-inset-*)`) are not applied.
- Contrast has not been measured against WCAG.
