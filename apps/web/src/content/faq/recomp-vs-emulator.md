---
question: "Recomp vs emulator: what's the difference?"
answer: An emulator imitates the console's hardware while the game runs. A static recompilation translates the game's code into a native program ahead of time. skate3recomp is a recompilation, so it runs like a PC game, but it still needs your own copy of Skate 3.
category: basics
games: [skate-3]
related: [guides/play-skate-3-on-pc, faq/which-skate-3-version, faq/rpcs3-basics]
order: 1
updated: 2026-10-01
---

## Emulators: pretend to be the console

[RPCS3](https://rpcs3.net/quickstart) (PS3) and [Xenia](https://github.com/xenia-canary/xenia-canary/wiki/Quickstart) (Xbox 360) are emulators. They load the original game and translate its instructions while it runs, on top of a software model of the console's CPU, GPU and operating system. That works for almost any game, but it costs a lot of performance, and every game has its own quirks to tune.

## Recompilation: translate once, run natively

A static recompiler does the translation **ahead of time**. [XenonRecomp](https://github.com/hedge-dev/XenonRecomp) "converts Xbox 360 executables into C++ code, which can then be recompiled for any platform". The [rexglue SDK](https://github.com/rexglue/rexglue-sdk) that Skate 3 uses describes the same idea: "Rather than interpreting or JIT-compiling PPC instructions at runtime, ReXGlue … generates C++ source code ahead of time."

The generated code also needs support code. XenonRecomp's README warns that the output "is not going to function correctly without a runtime backing it", meaning something has to replace the console's graphics, audio and system calls. That runtime is most of the work in a recomp project, and much of it builds on Xenia's research ([XenonRecomp credits](https://github.com/hedge-dev/XenonRecomp)).

## What that means for Skate 3

[skate3recomp](https://github.com/mchughalex/skate3recomp) is "an unofficial native recompilation of the Xbox 360 version of Skate 3, supporting Windows, Linux, and macOS." Since v2.0 it skips GPU emulation and uses "a native renderer built directly on Direct3D 12 and Vulkan", which the README says delivers more than twice the frame rate of the emulated renderer at roughly a quarter of the GPU power draw.

It doesn't include the game: "The project does not include Skate 3 retail game files", so you point it at the disc image of your own Xbox 360 copy. The Android, iOS, PS4 and web builds listed in the [Skate 3 history](/history/skate-3/) all build on this recompilation.

| | Emulator (RPCS3, Xenia) | Recomp (skate3recomp) |
|---|---|---|
| Runs | the original disc image | a native program, plus your disc image's data |
| Performance | heavy, tuned per game | close to a native PC game |
| Mods | file swaps, emulator patches | DLC packs, the Level Loader, engine-level changes |
| Platforms | wherever the emulator runs | Windows, Linux, macOS, plus community ports |
