---
title: The ReSkate Trainer puts skate.'s physics on sliders
description: A day after ReSkate 1.0, the first trainer for skate. arrived. It adds super ollies, fast flips and spins, never bail, presets, practice markers, slow motion and a live editor for every physics value the game actually reads.
date: 2026-10-03
author: skatemods
games: [skate-2025]
related: [guides/play-skate-with-reskate, history/reskate]
---

Every skate game eventually gets a trainer. Skate 3 had [CH3AT](/history/skate-3/) on RPCS3 and, this year, [SK8TRAINER](https://github.com/andrewnakas/sk8trainer) inside the native recomp. EA's 2025 skate. got its first one barely a day after [ReSkate](/blog/reskate-launch/) opened the game up.

The [ReSkate Trainer](https://github.com/andrewnakas/reskate-trainer) is by Nakas, who also runs this site. It adds a **TRAINER** page to the ReSkate menu (Insert).

> **Update, October 5:** the trainer was [merged into ReSkate](https://github.com/Dingo-Shenanigans/ReSkate/pull/37) and ships with every release since **1.0.9**, so there's nothing to install. By then it was on version 0.3.0, with every preset as a dial, Realistic and Fun lists, flip trick speed, auto push, and 243 of its 314 extra class values confirmed as read by the game. The installation steps below are for the old standalone fork. The [ReSkate guide](/guides/play-skate-with-reskate/#practice-with-the-trainer) covers the built-in version.

## What's in it

- **Presets.** One click for super high ollie, fast flips, fast spins or never bail. Stackable presets like Mega Pop, Fast, Hard To Bail and Sticky Grinds layer on top, and each one switches off on its own. You can save your own presets, including one per map.
- **Tune.** Every value in the game's physics tuning, by name, with search, an Essentials list, freeze and reset. Changes apply as you drag.
- **Practice.** Game speed and pause, five marker slots per map, return after a bail, and teleport.
- **Map and HUD.** A speed and air HUD, a read-out after every jump, telemetry recording, and a `trainer.json` that map makers can ship with a map.

## Only the values that matter

skate.'s tuning data, which the Tune tab edits, is full of named values, and the game ignores a lot of them. A pass over the game's code found that it reads about **six in ten**. Version 0.1.2 hides the rest unless you tick "Values with no use found", so sliders don't silently do nothing.

The same pass fixed the headline features. In 0.1.0, some of the obvious values like ollie height did nothing, because the game reads differently named values instead. Ollie height, body flip speed and body spin speed are now plain numbers at the top of the Essentials list, wired to what the game really uses.

## Installing it

The trainer is ReSkate 1.0.3 with the trainer built in, for the same game build (Steam `25414733`). It replaces ReSkate's own `ReSkate.dll` and `ReSkateLauncher.exe`, so the launcher can't install it like a Thunderstore mod. Back up those two files, copy the trainer's over them, and press Insert in game. Restore your backups to go back to stock. The [ReSkate guide](/guides/play-skate-with-reskate/#practice-with-the-trainer) has the steps.

It ships no game data and unlocks no cosmetics. Online, it follows ReSkate's session rules: a guest under host tuning can't edit, and teleports follow the host's permission. It's open source under the GPL-3.0, like ReSkate, and isn't affiliated with EA or the ReSkate developers.

## Known limits

It works with one game build at a time, so a game update needs a new trainer build. Controller shortcuts for markers haven't been tested much yet, and the jump read-out reads low when game speed isn't 1x. Feedback goes to the [GitHub repo](https://github.com/andrewnakas/reskate-trainer) or the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX).

## Also from Nakas: Gravy Train

[Gravy Train](https://thunderstore.io/c/reskate/p/Nakas/Gravy_Train/) is a downhill map on the ReSkate Thunderstore: nine step-down jumps that start with 20 m flights and end with kilometre-long ones. With the trainer's jump read-out on, you can see exactly how far you flew. Find it and everything else on [skate. mods](/reskate/).
