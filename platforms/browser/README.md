# OpenSmash browser platform

This branch retains the history of `999sian/melee-pc`. Game logic, Aurora GX,
software AX mixing, and memory-card support come from that upstream. Browser
platform code and OpenSmash presentation hooks live on `opensmash/browser`.
The base revision and toolchain are recorded in `tools/browser/upstream.json`.

## Build

Prerequisites: Python 3, CMake, Ninja, LLVM 22 with LibTooling, GCC 16 for the
big-endian storage oracle, and Git. On Apple Silicon, LLVM defaults to
`/opt/homebrew/opt/llvm@22`; override `LLVM_ROOT` elsewhere.

```sh
python3 tools/browser/setup_sdk.py
python3 tools/browser/build.py --jobs 6
node --test tests/browser/*.test.mjs
python3 tools/browser/serve.py --port 5190
```

Open the local validation page and select your own GALE01 revision 2 disc.
Game data is read locally and is not included in the repository. The shared
OpenSmash launcher serves these assets through `/engine/upstream/` and uses
`?engine=upstream`. Set `MELEE_PC_ROOT` in its server environment to this checkout.

The compiler lowers GCC's big-endian `DISC_STRUCT` accesses before compiling
with Emscripten. Ordinary runtime structs remain native-endian. Compiler tests
compare both values and bytes with GCC before building the game. Do not apply
whole-structure byte swaps to replace this lowering.

Browser WebGPU calls run in one realm. The launcher hosts that realm in an
iframe, exchanges frame bitmaps and input through the existing session protocol,
and consumes the upstream audio mixer through a shared ring buffer. Legacy
MPCS saves are copied into GCI format, retaining their original payload and file.

## Updating upstream

Work on a dedicated integration branch with a clean checkout:

```sh
git fetch upstream
git switch -c opensmash/sync-YYYY-MM-DD opensmash/browser
git merge --no-ff upstream/master
```

Resolve conflicts in source, keeping native platform behavior intact. Record the
actual merged upstream revision in `tools/browser/upstream.json`. Run the full
browser build, compiler oracle, cache/save tests, and the browser gameplay and
performance validation before updating the OpenSmash engine pin. Keep test
reports with the integration change. Do not update a pin to an untested branch
head. A merge preserves the downstream history and supports repeated syncs.

## Browser-specific GPU uploads

Native mapped staging buffers remain unchanged. The browser uses a persistent
CPU arena and `Queue.WriteBuffer` for the used ranges of each frame. This avoids
emdawn allocating, clearing, and copying all 87 MiB of staging capacity on every
frame. GPU copy commands, render state, pool capacities, and ordering are retained.
Browser staging pools use `CopyDst | CopySrc`; they are never mapped during
play. GX pipelines compile asynchronously, and only draws whose pipeline is
still pending are skipped. Initial VS/match preparation waits for outstanding
pipeline compilations, a fresh 30-frame timing window, and GPU queue completion
before revealing the scene. This keeps first-use compilation off the submission
path without revealing an unfinished initial scene.

## Standby startup

The shared launcher loads WASM, verifies the disc, restores saves, and fetches the
shader-cache seed while the roster is open. Native `main` starts only after Play:
its graphics and SQLite initialization otherwise interrupts browsing. The
launcher installs replacement assets and match settings before calling main.


Run `MELEE_RELAUNCH=1 node tests/browser/shared-performance.mjs` to also check that
returning to the unified roster warms a replacement engine and that a different
four-fighter lineup can launch from it. `node tests/browser/roster-performance.mjs`
checks that native initialization stays deferred during roster browsing.
The launch trace records loading UI transitions
alongside the engine events; intentional VS playback is separate from opening.

## Validation

The checked-in `validation` directory records real-disc functional coverage and
launcher benchmarks. Run the compiler/cache/save checks with `build.py`, then:

```sh
export MELEE_ISO=/absolute/path/to/melee.iso
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright
node tests/browser/e2e.mjs roster
node tests/browser/e2e.mjs stages
node tests/browser/e2e.mjs custom
node tests/browser/flows.mjs
```

Custom tests require local generated fixtures. In the OpenSmash integration
checkout, start the shared launcher and run
`python3 engines/melee/tools/prepare_upstream_fixtures.py`. Start this fork's
validation server with `--fixtures /absolute/path/to/engines/melee/build/upstream-fixtures`.
Fixtures are local game/custom-character data and are never checked into this
fork. Set `LEGACY_SAVE` to an existing MPCS `.sav` file to include save migration.
Use `TEST_OUTPUT` to keep separate reports and `MELEE_CASES` for a corrective rerun.

These tests establish the listed scenarios, not exhaustive frame-by-frame
identity for every possible match or a completed playthrough of every mode.
Native desktop builds and mobile browser performance need their own validation.

