# Safari hitch investigation — 2026-09-17

Full built website shell at localhost:5299/melee, Safari 26.5.2, macOS
26.5.2, Apple M5 32 GB, Auto 960×720, WebGPU, audio enabled. Four fighters
on Brinstar Depths. Existing browser profile and caches; other desktop apps
remained open. Metrics measure engine progression, not physical scanout.

## Retained changes

Browser vertex, uniform, index, and storage uploads now write directly to
final GPU buffers before submitting the frame. Packet ranges are append-only;
queue ordering preserves earlier submissions. This removes 63 MiB of duplicate
GPU buffer capacity and the associated GPU copies. Texture uploads retain
their copy-source buffer. Native rendering is unchanged.

The website separately detaches each 64 MiB verification input after hashing
where ArrayBuffer.transfer is available. Disc verification remains sequential
and authenticates all chunks; unsupported browsers retain the existing path.

## Results and limits

Three uninterrupted 30-second windows with these changes:

| Window | FPS | p99 ms | Maximum ms | Frames >33 ms | Audio underruns |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 59.81 | 21.36 | 62.80 | 2 | 0 |
| 2 | 59.96 | 20.80 | 48.14 | 1 | 0 |
| 3 | 59.83 | 20.40 | 72.66 | 2 | 0 |

Baseline/repeat totaled 20 slow frames over 180 seconds, with maxima up to
156.82 ms. The changed run has five over 90 seconds. This is encouraging,
but the sample is too small and variable to establish a reliable hitch fix.

A fresh WebContent process repeated at 59.81/59.93 FPS, maxima 95.12/59.16 ms,
one slow frame per 30-second window, zero audio underruns. Exclude its third
window: DevTools was opened during capture. Its physical footprint was about
1.0 GiB (1.3 GiB peak); repeated-reload process measurements are not a valid
controlled memory comparison. The 63 MiB saving is allocated GPU capacity,
not a claim of an equal measured process-footprint reduction.

Remaining stalls are predominantly in elapsed game/scheduling time. An OS
sample includes JSC collection, WASM optimization, and WebKit memory-pressure
release activity. Near-30-second recurrence is consistent with WebKit's
memory-pressure polling, but aggregate stacks do not prove each hitch's cause.
Async disc misses did not overlap the five largest sampled stalls.

One-time direct-presentation messaging, smaller bind-group offset views, and
RAF pacing were tested and reverted: repeated runs did not establish a
consistent benefit. Do not report the first unusually clean run as a fix.

## Validation

- Browser WASM target rebuilt successfully.
- Twelve runtime/disc-cache/save tests passed.
- Seven website disc-verification tests passed, including the real USA 1.02 ISO.
- Safari full-shell gameplay, HUD, textures, and audio verified.
- Chrome 152 full-shell roster launch, introduction, four-fighter gameplay,
  textures, HUD, pause/resume and active audio verified on Hyrule Temple.
- Android was not rerun for this change. No production deployment performed.

Compact window data, including unsuccessful experiments: safari-hitches.json.
Local raw captures and OS samples: build/saga/safari/hitches/.
