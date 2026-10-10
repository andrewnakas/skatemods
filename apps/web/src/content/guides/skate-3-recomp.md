---
title: "Skate 3 Recomp: install, mods, maps, Steam Deck"
description: Everything about skate3recomp, the native PC port of Skate 3. Version 2.0's D3D12 and Vulkan renderer, DLC, custom maps, saves, Steam Deck, Android and iOS builds, and where online play stands.
game: skate-3
level: beginner
order: 1
updated: 2026-10-10
downloads:
  - { label: "skate3recomp for Windows", url: "https://github.com/mchughalex/skate3recomp/releases/latest/download/Skate3Recomp-Windows.zip", note: "direct download of the latest release" }
  - { label: "skate3recomp for Linux", url: "https://github.com/mchughalex/skate3recomp/releases/latest/download/Skate3Recomp-Linux.zip" }
  - { label: "skate3recomp for macOS", url: "https://github.com/mchughalex/skate3recomp/releases/latest/download/Skate3Recomp-macOS.zip", note: "Apple Silicon, experimental" }
  - { label: "Skate 3 Level Loader", url: "https://github.com/andrewnakas/skate3-level-loader/releases/latest", note: "for community maps" }
  - { label: "Skate3-Mobile (Android)", url: "https://github.com/Buku313/Skate3-Mobile/releases/latest", note: "community ARM64 build" }
---

[skate3recomp](https://github.com/mchughalex/skate3recomp) by mchughalex is "an unofficial native recompilation of the Xbox 360 version of Skate 3, supporting Windows, Linux, and macOS." The game's PowerPC code was translated to native code ahead of time with the ReXGlue SDK, so it runs as a PC program instead of under an emulator. The current release is **v2.0.2** (July 24, 2026). It doesn't include the game: you need your own Xbox 360 disc image.

## Install

The short version, from the README:

1. Download the zip for your system from the [releases page](https://github.com/mchughalex/skate3recomp/releases/latest) and extract it to a folder you control.
2. Run `skate3.exe` (Windows), `skate3` (Linux) or the `skate3recomp` app (macOS).
3. Click **Select ISO** and pick your Xbox 360 disc image. The installer extracts the game files.
4. Click **Start Game**.

[Play Skate 3 natively on PC](/guides/play-skate-3-on-pc/) has the same steps with notes for macOS Gatekeeper and Linux. [Dumping your own games](/faq/dumping-your-own-games/) covers getting the ISO.

## What 2.0 changed

v2.0.0 replaced Xbox 360 GPU emulation with a native renderer "built directly on Direct3D 12 and Vulkan". The README says it gives "more than twice the frame rate at roughly a quarter of the GPU power draw", and closer to 10× the frame rate on Apple Silicon.

- **Settings → Video → Renderer** switches between Native and Emulated, and **F5** toggles them live. If the native renderer fails, the game falls back to the emulated one.
- On Windows, **Settings → Video → Graphics API** picks DirectX 12 or Vulkan. Linux uses Vulkan, and macOS uses Vulkan through MoltenVK.
- Optional extras: MSAA up to 8×, sun shadows, ambient occlusion, bloom, volumetric lighting, longer draw distance, render scale up to 3× and true ultrawide.

Known issues listed in the README: texture pop-in while streaming, skater customization rendering, Hall of Meat bone highlights, and some park-editor visual differences.

## DLC

Make a `dlc` folder beside the executable, in the installed game folder or in the user data folder, put the package files from your own Xbox 360 DLC in it, and start the game.

## Custom maps and mods

- **Community maps:** the [Skate 3 Level Loader](/guides/install-community-maps/) imports any number of DLC-format map packs and boots straight into the one you pick. It works from an existing recomp install.
- **PS3 maps:** most classic custom maps were made for the PS3. [Convert them](/guides/convert-ps3-maps/) to recomp format.
- **Which maps load:** [Skate 3 custom maps](/guides/best-skate-3-custom-maps/) lists the packs that boot.
- **Training tools:** see the [Skate 3 tools list](/tools/).

## Saves

Saves live in `%APPDATA%\skate3` on Windows. Create a `saves` folder beside the executable to keep saves there, or an empty `portable.txt` to keep all user data beside the executable. Existing saves aren't moved for you.

## Controls

An Xbox controller is the main input. PlayStation, Switch and generic controllers work through the SDL backend (**Settings → Controls → Controller Backend**, then restart), which is always on for Linux and macOS. Keyboard controls can be turned on in the settings. **Escape**, or **RB + Start** on a controller, opens the settings menu.

## Steam Deck

Use the Linux build, or the Windows build through Proton. The README notes that on some setups Proton runs better than the native Linux build. Open issues to know about: a [graphics freeze in skater customization](https://github.com/mchughalex/skate3recomp/issues/79) on the Deck. Earlier reports about the default Deck configuration and a cut-off video settings menu were closed in July 2026. [Skate 3 on Steam Deck](/faq/skate-3-on-steam-deck/) compares the Recomp with RPCS3 there.

## Android and iOS

There's no official mobile build. [Skate3-Mobile](https://github.com/Buku313/Skate3-Mobile) by Buku313 is an ARM64 recompilation with Vulkan rendering. Its GitHub description: "Download one APK, select your own ISO, and skate." Its latest release is v2.1.0 (September 15, 2026), tested on a Retroid Pocket 6. For iPhone and iPad, [skate3-ios-setup](https://github.com/andrewnakas/skate3-ios-setup) builds the recompilation from your own disc image.

## Online play

The Recomp has no online mode. An [open issue](https://github.com/mchughalex/skate3recomp/issues/140) asks for one and hasn't had an answer. To skate online today, use [RPCS3 with the community Blaze server](/faq/skate-3-online/) for the original game, or [Clean Room Skate Online](/skate-3-online/) in a browser.
