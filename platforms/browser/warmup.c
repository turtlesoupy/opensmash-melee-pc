/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <melee/ef/efsync.h>
#include <sysdolphin/baselib/forward.h>
extern void* hsd_8039930C(HSD_Particle*, HSD_Particle*);
#include <emscripten.h>
#include <stdio.h>

volatile int browser_warming_effect_code;
void browser_warm_effect_code(void) {
    /* Volatile indirect calls retain the original bodies. Constant folding or
     * inlining a no-op would leave their first-use compilation in gameplay. */
    void* (*volatile particle)(HSD_Particle*, HSD_Particle*) = hsd_8039930C;
    void* (*volatile effect)(s32, HSD_GObj*, ...) = efSync_Spawn;
    const double start = emscripten_get_now();
    browser_warming_effect_code = 1;
    particle(NULL, NULL);
    effect(0, NULL);
    browser_warming_effect_code = 0;
    fprintf(stderr, "[opensmash] effect code prepared in %.2f ms\n", emscripten_get_now() - start);
}
