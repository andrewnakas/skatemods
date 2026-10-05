---
title: Play Skate 3 natively on PC
description: Install skate3recomp on Windows, Linux or macOS from your own Xbox 360 disc image.
game: skate-3
level: beginner
order: 1
updated: 2026-10-01
---

skate3recomp runs the Xbox 360 game as native code: its PowerPC code was translated ahead of time, and since v2.0 a native Direct3D 12 / Vulkan renderer draws the scene. It's the base most current Skate 3 mods build on.

## What you need

- Your own **Xbox 360 Skate 3 disc image** (ISO). Nothing on this page ships game files.
- Optionally, **Title Update 3** if you plan to use the Level Loader. It asks for it on first run.
- An Xbox controller (best), a PlayStation or Switch controller through SDL, or a keyboard.

## Install

1. Download the zip for your OS from the [skate3recomp releases](https://github.com/mchughalex/skate3recomp/releases): `Skate3Recomp-Windows.zip`, `-Linux.zip` or `-macOS.zip`.
2. Extract it to a folder you control (not `Program Files`).
3. Run `skate3.exe` (Windows) or `skate3` (Linux/macOS).
4. Click **Select ISO**, pick your disc image and wait while the installer extracts the game files.
5. Click **Start Game**.

<div class="callout">

**macOS:** the ARM build is experimental. If Gatekeeper blocks it, open **System Settings → Privacy & Security → Open Anyway**.

**Linux:** some setups run better with the Windows build through Proton than with the native Linux build.

</div>

## Settings worth changing

v2.0 added MSAA up to 8×, better shadows, ambient occlusion, bloom, volumetric lighting, longer draw distance, render scale up to 3× and ultrawide support. Start with render scale and MSAA, and raise the rest if you have headroom.

## Known rough edges

Texture pop-in while streaming, skater customization rendering, Hall of Meat rendering, and some park-editor visual differences. Check the project's issue tracker before reporting a bug.

## Next

- [Install community maps](/guides/install-community-maps/)
- [Convert a PS3 map](/guides/convert-ps3-maps/)
