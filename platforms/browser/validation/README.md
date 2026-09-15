# Browser validation — 2026-09-15

The optimized browser build was validated on Apple M5 / 32 GB / macOS with
Chrome 152 at 960×720, using a local unmodified USA 1.02 disc. `build.json`
records the exact WASM fingerprint, upstream base, and toolchain.

## Functional coverage

- `roster.json`: all 26 selectable fighters enter and advance in real matches.
- `stages.json`: all 29 launcher-selectable stages enter and advance.
- `custom.json`: all 26 custom movesets render through the OpenSmash skinning
  path; matrix checks compare against the original HSD matrix operations.
- `flows.json`: custom results → character select → stage select → rematch;
  custom roster paging; Classic and Adventure entry; All-Star victory → rest
  area (internal stage 66); VS menu; original boot/movie/title → main menu;
  import of an existing MPCS save into a valid GCI and original game boot.
- Save checks require a real game-created GCI and bytes persisted in IndexedDB.
  The legacy file is retained; conversion preserves the payload byte for byte.

The final functional pass was rerun after the browser GPU upload optimization.
Earlier failed-case history is retained in the matrix reports. Corrective work
included a typed Falco attribute access, aligned movie DVD buffers, native
results geometry fields, and controller tests that navigate actual menu targets
and account for score screens embedded in gameplay scenes.

These are functional scenarios, not exhaustive frame-by-frame equivalence or
complete playthroughs of all modes. Short functional frame-time samples include
new effects and driver compilation; use the separate sustained benchmarks for
performance comparisons. Native desktop builds and mobile browsers were not
validated in this run.

## Compiler and memory checks

987 game/platform C translation units compile through the DISC_STRUCT lowering
pass. Five fixtures compare host Clang and WASM values and raw bytes with GCC:
scalar/array/bitfield access, enums, initializers, side effects, and CP932 text.
All ten comparisons pass. Two text-conversion checks and five JavaScript cache
and save-migration tests pass. Archive-range reuse/splitting passes ASan/UBSan.

## Shared launcher benchmarks

The OpenSmash integration repository records three consecutive 30-second
windows for each workload in `engines/melee/validation/upstream`:

| Workload | FPS range | Worst p95 | Worst p99 | Audio underruns/overruns |
| --- | ---: | ---: | ---: | ---: |
| 2 players | 59.91–60.00 | 17.87 ms | 18.61 ms | 0 / 0 |
| 4 custom fighters | 59.96–60.00 | 19.33 ms | 24.61 ms | 0 / 0 |

Both pass every established gate, including rendered-audio coverage. The
launcher uses the upstream engine by default; disc verification/reuse and
return-to-roster/replay are tested through the shared UI. Click-to-match is
about 4.1 seconds, measured after disc verification.

Audio tests use Chrome's real AudioWorklet/Sonic consumer with
`--disable-audio-output`: the host's physical output clock also stalled with a
standalone oscillator. Physical speaker playback is not established by these
measurements. Fresh Chrome profiles are used; OS/GPU caches are not purged.

See [build and reproduction instructions](../README.md). No ROM, costume fixture,
or proprietary game asset is included in these reports.

The subsequent reproducibility fix changes only SDL’s compiled revision banner.
`build.json` retains both artifact fingerprints; game and renderer sources are
unchanged from the full validation pass. The final rebuild is checked for
identical output across a repository commit and for launcher/controller startup.
