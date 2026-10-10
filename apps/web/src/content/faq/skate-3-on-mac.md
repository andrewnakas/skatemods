---
question: Can I play Skate 3 on a Mac?
answer: Yes. The Skate 3 Recomp has an experimental Apple Silicon build, RPCS3 runs the PS3 version on macOS, and Clean Room Skate Online runs in Chrome on a Mac with no game files. Xenia doesn't support macOS.
category: skate-3
games: [skate-3]
related: [guides/play-skate-3-anywhere, guides/skate-3-recomp, faq/rpcs3-basics]
order: 39
updated: 2026-10-10
---

## The Recomp (Apple Silicon)

[skate3recomp](https://github.com/mchughalex/skate3recomp) ships a macOS ARM build, which its README calls "experimental and more prone to issues". On Apple Silicon the native renderer runs through Vulkan on MoltenVK, and the README puts the frame-rate gain over the emulated renderer "closer to 10x" there.

1. Download [Skate3Recomp-macOS.zip](https://github.com/mchughalex/skate3recomp/releases/latest/download/Skate3Recomp-macOS.zip) and extract it to a folder you control, not Downloads or Applications. The game keeps its files, saves and settings beside the app.
2. The first time, right-click the app and choose **Open**, or approve it in **System Settings → Privacy & Security**.
3. Click **Select ISO** and pick your own Xbox 360 disc image.

Some players report crashes at launch on macOS ([#102](https://github.com/mchughalex/skate3recomp/issues/102), [#139](https://github.com/mchughalex/skate3recomp/issues/139)). Check those issues if it won't start. [Full Recomp guide](/guides/skate-3-recomp/).

## RPCS3

[RPCS3](https://rpcs3.net/download) has macOS builds, and Skate 3 is rated Playable on it. You need your own PS3 disc dump and the PS3 system software. See [How well does Skate 3 run on RPCS3?](/faq/rpcs3-basics/)

## In the browser

[Clean Room Skate Online](/skate-3-online/) runs a fan-made Skate 3 engine rewrite in Chrome or Edge on macOS. It needs no game files. It has parks and community maps, not the Skate 3 city.

## Not on Mac

Xenia's builds are for Windows and Linux.
