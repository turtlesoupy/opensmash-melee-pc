# Saga: full website experiment — 2026-09-17

Melee runs in the **full Smash.fun website shell** on the connected Saga:
roster, disc verification and storage, custom-fighter fitting, announcer/intro,
CRT overlay, existing Melee touch controls, and AudioWorklet playback. The engine and website changes are recorded in their respective repositories;
these measurements use the local compiled website, not a hosted deployment.

## Open the running experiment

Open `http://localhost:5299/melee` in **Chrome on the Saga** while it remains
USB-connected to this Mac. The local server and `adb reverse` supply the site.
The original disc is already verified and saved in that browser origin.
The Pixel connected alongside the Saga was not modified.

The device runs Android 16, Chrome 153, and Jelly/WebView 152. Both browsers
expose a WebGPU adapter, but Jelly reports `crossOriginIsolated=false` even with
correct headers and cannot run the shared-memory engine. Chrome works without
GPU flags, blocklist overrides, OS changes, or package installation.

## Resolution setting

**Settings → Gameplay Options → Render resolution** persists across reloads
and applies to the next match, including a previously warmed standby engine.

- Automatic: 640×480 on phones, iPads, and devices reporting ≤4 GiB RAM;
  960×720 on other computers. Unknown desktop capabilities default to 960×720.
- Overrides: 640×480, 960×720, 1280×960, 1440×1080, 1920×1440.
- The browser renderer treats these as physical pixels. SDL no longer multiplies
  them by DPR. The iframe still fills the shell's existing display area.
- The setting is for the browser engine; it is not shown for the separate native
  desktop engine. Native window behavior is unchanged.

The Saga's original 960×720 logical canvas became 2520×1890 at DPR 2.625.
Automatic now renders 640×480, reducing its pixel count by 93.55%. No gameplay
speed, physics, animation, or fighter data is simplified.

## Full website results

The first full-shell run used four fighters (three custom, one stock) on
Rainbow Cruise, with the CRT overlay enabled and the existing audio path:

| 30-second window | FPS | p95 interval | p99 interval | Audio underrun / overrun samples |
| --- | ---: | ---: | ---: | ---: |
| 1 | 58.97 | 19.03 ms | 25.66 ms | 0 / 0 |
| 2 | 59.28 | 18.13 ms | 22.31 ms | 0 / 0 |
| 3 | 59.41 | 17.93 ms | 21.34 ms | 0 / 0 |

Audio consumed approximately 1.44 million stereo frames per 30-second window
at 48 kHz. Maximum individual frame intervals were 84–94 ms: this is near-60
FPS, not hitch-free rendering. Reports are in `build/saga/full-shell-first.json`.

The compiled website also ran a four-fighter Battlefield match at a user-selected
960×720: **59.51 FPS**, p95 18.66 ms, p99 23.37 ms, zero audio underruns/overruns.
The actual framebuffer dimensions were asserted. The setting survived reload,
and the website's real touch stick, jump, attack, and neutral release all reached
the engine. The test's first screenshot write exceeded Node's default 1 MiB
buffer; the screenshot was captured separately and the harness limit corrected.
Gameplay data and touch assertions had already completed successfully.

Desktop Chrome's settings default was separately checked as Automatic (960×720),
and a 1280×960 override survived reload. The Saga was restored to Automatic.

## Reproduce

Build the engine and website, then start the local backend pointing at this
checkout with `MELEE_PC_ROOT`. It needs the existing local disc for costume/CSS
preparation; the phone independently uses its own selected and verified disc.
For this session `build/saga/start-shell.py` supervises an authenticated loopback
backend on 5197 and the full website on 5299. It uses random process-local
service credentials and no live service configuration.

`SERVE_BUILT_FRONTEND=1` serves Vite's compiled assets with the local development
server/API configuration; it does not disable production authentication guards.
The frontend build, Melee TypeScript check, seven focused launcher/resolution
checks, and seven runtime preparation/standby checks passed.

```sh
adb -s O1N1XT142300980 reverse tcp:5299 tcp:5299
adb -s O1N1XT142300980 forward tcp:9224 localabstract:chrome_devtools_remote
ADB_SERIAL=O1N1XT142300980 \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
TEST_OUTPUT=build/saga/full-shell \
node tests/browser/android-shell.mjs
```

First open the website, select a disc through its normal picker, and close
Settings. The test launches through the real website bridge, checks the runtime
framebuffer and four active fighters, sends actual CDP touch gestures through
the website controls, then requires three complete 30-second combat windows.
`MELEE_WIDTH` asserts an override already selected in Settings; `MELEE_WINDOWS`
changes duration. It preserves the running match when finished.

FPS measures game/render submission cadence rather than hardware scanout.
Memory reporting is the WASM heap, not total Chrome/GPU RSS. Results do not
establish all-stage/all-character compatibility, physical speaker quality, or
hours-long thermal stability. Standalone diagnostic pages were used during
initial isolation only and are not part of the final source changes or final E2E.

## Final compiled-shell acceptance

After restoring Automatic through the real Settings menu, the renderer was
asserted at 640×480. Three consecutive 30-second windows with four fighters:

| Window | FPS | p95 | p99 | Maximum interval | Audio underruns / overruns |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 59.20 | 18.35 ms | 25.32 ms | 83.09 ms | 0 / 0 |
| 2 | 59.78 | 18.18 ms | 21.14 ms | 88.65 ms | 0 / 0 |
| 3 | 59.80 | 17.82 ms | 21.60 ms | 47.91 ms | 0 / 0 |

No page/runtime errors; the heap remained 256 MiB. The website's analog stick,
jump, attack, and release passed native-controller assertions. This includes
relaunch from the warmed engine after the 960×720 match and reuse of the saved
local disc. Full results and the actual device screenshot are in
`build/saga/shell-final/`.

A separate 30-second continuous joystick drag (825 CDP touch-move events)
measured **59.59 FPS**, p95 19.70 ms, p99 24.19 ms, maximum 88.52 ms, with the
heap still 256 MiB. See `build/saga/shell-drag.json`. This is synthetic touch
input on the physical phone, not a claim of manual finger testing.

## Hitch follow-up

Chrome traces identified unnecessary main-thread work in the full shell. The
website now skips geometry checks for dialogs under hidden ancestors, mounts
controller settings only while that settings page is open, skips viewport reads
in the hidden mobile hardware animation, and caches joystick geometry for each
gesture (resetting input on resize/orientation changes).

A fresh compiled-shell match after these changes passed the same physical-phone
E2E, including native stick/jump/attack/release assertions:

| 30-second window | FPS | p95 | p99 | Maximum interval | Intervals >33 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 58.75 | 20.09 ms | 27.23 ms | 89.32 ms | 7 |
| 2 | 59.86 | 18.24 ms | 22.99 ms | 35.14 ms | 1 |
| 3 | 59.11 | 19.56 ms | 24.19 ms | 34.51 ms | 3 |

All windows had zero audio underruns/overruns, no runtime/page errors, and a
stable 256 MiB WASM heap. Results are in `build/saga/hitch-fixed/`. The real
Players & Controllers settings page also passed a mount/open/close/unmount
check on the phone. Focused controller/resolution tests, TypeScript, and the
compiled frontend build passed.

The later windows avoided the previous 80–90 ms pauses, but a first-window
89 ms hitch remains. This is a single before/after sample with different match
activity, not proof that all hitches are eliminated or that average FPS improved.
The changes remove measured unnecessary layout/polling work without changing
simulation timing; first-use engine/GPU and Android scheduling stalls remain
possible.
