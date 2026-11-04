# Performance report

Honest status: **no device performance has been measured.** Every number below comes from a headless Chromium run on a software-rendered GL backend (SwiftShader) with a fake camera. These numbers do not represent real phones or GPUs.

## Measured data points (from runs this project)
| Measurement | Value | Conditions |
|---|---|---|
| MediaPipe face detection + segmentation, one 640 px frame | ~5.0 s (first run, includes model load) | SwiftShader, CPU delegate fallback |
| Video export, 1.6 s trim with filter and mute | 1.60–1.64 s wall time (five runs) | Real-time re-encode |
| Fake-camera capture at 4K | Page became unresponsive | Fixed by capping the test camera at 720p; real 4K hardware untested |

## Mitigations in code
- Adaptive detection interval in `src/modules/camera/fx.ts` (backs off when detection is slow).
- Frame-rate governor and reduced background mode in `OceanBackground.tsx`.
- Low-power auto-detection from `hardwareConcurrency` and `deviceMemory` (`usePrefs.ts`).
- Lazy loading of signed media URLs via `IntersectionObserver`.

## Not done
- Lighthouse runs (performance, accessibility, best practices).
- GPU profiling with Spector.js or Chrome DevTools.
- Memory-leak testing.
- Bundle-size analysis.
- Real-device tests on iOS and Android.
