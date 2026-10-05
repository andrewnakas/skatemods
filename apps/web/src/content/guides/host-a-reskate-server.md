---
title: Host a ReSkate server
description: Run ReSkate's dedicated server for skate. (2025) on Windows or Linux. It covers the config file, custom maps, admins, votes, global bans and the fair-play checks. It needs no game install and no open ports.
game: skate-2025
level: intermediate
order: 7
updated: 2026-10-05
---

ReSkate ships a headless dedicated server, `ReSkateServer.exe`, that shows up in every player's in-game browser (**Multiplayer → Servers**). It needs **neither the game nor Steam installed**, and players connect through Steam's relay network, so you don't have to open any ports. This guide follows the official [server manual](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README.txt) for ReSkate 1.1.1. There's a native [Linux build](#on-linux) too.

## Set it up

1. Download `ReSkateServer-<version>.zip` from [ReSkate's releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest) and unzip it into its own folder.
2. Keep the folder together. `steam_api64.dll`, `steamclient64.dll`, `tier0_s64.dll` and `vstdlib_s64.dll` are how the server talks to Steam, and `world-layers.json` lets it set time of day and other world layers for everyone.
3. Run `ReSkateServer.exe` once. It writes `ReSkateServer.json` next to itself.
4. Edit that file. At minimum, set `name` and add your SteamID64 to `admins`.
5. Start the server again. Players find it by name in the browser.

The server signs in to Steam anonymously and gets a new Steam ID, and so a new join code, every time it starts. The browser always finds it by name. If you forward **UDP 27015–27016** anyway, the browser also shows your ping and joins are a little faster.

## A starter config

```
{
  "name": "Port Carverton Sessions",
  "map": "San Vansterdam",
  "max_players": 32,
  "password": "",
  "welcome": "Be cool. /vote map to change maps.",
  "listed": true,
  "admins": ["76561198000000000"],
  "votes": {
    "map": { "enabled": true, "percent": 60 },
    "time_of_day": { "enabled": true, "percent": 50 }
  },
  "world_layer_sync": true,
  "object_placement": "admins",
  "speed_check": "warn",
  "score_check": "warn"
}
```

Any key you leave out keeps its default, and changes made from the console or by an admin in game are saved back to the file. The useful ones:

| Key | What it does |
|---|---|
| `map` | `"San Vansterdam"`, `"Isle of Grom"`, `"Super Ultra Mega Resort"`, `"Stadium 1"`, or a custom map |
| `max_players` | 1–249 |
| `password`, `listed` | Lock it, or hide it from the browser so players need the code |
| `votes` | `map`, `kick` and `time_of_day` votes, each off until enabled |
| `object_placement` | `everyone`, `admins` or `nobody` can build |
| `noclip`, `no_bail`, `boosts` | What players may use (admins always can) |
| `tps` | Network updates per second: 20, 30, 60 or 120 |
| `voice_chat`, `voice_range` | Proximity voice, 50–1000 m |
| `parties`, `party_size` | Player parties, 2–8 per party |
| `auto_update` | Install new ReSkate releases when nobody's on (default true, Windows only) |
| `global_bans` | Turn away players on the ReSkate team's ban list (default true, see below) |
| `port`, `query_port` | 1–65535; default 27015 and 27016. Since 1.1.0 an out-of-range port is refused instead of silently wrapped |

## Custom maps

Copy a map's mod folder from the game's `Mods` folder into a `Mods` folder next to the server. The server only reads its `reskate-levels.json`, so it doesn't need the map data. Then set `"map"` to the map's name (for example `"bbcity"`), or switch to it with `map <name>`. **Every player needs the same map mod installed** to join, so link it in your `welcome` message.

## Run it

Type commands in the server window. Admins can run the same commands in game with `mp server <command>` in the console, or in chat with a slash (`/kick`, `/map`, `/votes`).

```
status                 name, map, players, code
players                who's on, with SteamID64s
map Isle of Grom       change the map
tod night              time of day for everyone (needs layer-sync on)
kick <player>          until the server restarts
ban <player>           for good; unban <id> to undo
placement admins       who can build
clear-objects          wipe placed objects
tpall                  everyone to you
update                 install a new release now
```

Players vote with `/vote map <map>`, `/vote kick <player>` or `/vote tod <time>`, then `/yes` or `/no`. Admins can't be vote-kicked.

## Fair play

The server runs three checks to keep throwdowns and co-op challenges fair:

- **`speed_check`** catches games running faster than normal, such as Cheat Engine's speedhack, from the timing of what they send.
- **`score_check`** flags players whose mods change trick scoring or skater physics. Each player's ReSkate checks its own mods at launch and reports when joining.
- **`enforce_tuning`** (on by default) keeps everyone on the game's own physics tuning, so edited truck settings don't show up on anyone's skater.

`warn` (the default) takes flagged players out of throwdowns and co-op until they're clean and tells the admins, `kick` removes them, and `off` disables the check. If your server is built around a scoring mod everyone installs, add its fingerprint with `score-allow`.

### Global bans

Since **1.1.1**, servers also read the ReSkate team's own multiplayer ban list from `api.reskate.dev`, at startup and every ten minutes, and turn those players away. Steam lobbies hosted from the game do the same. It's on by default. Set `"global_bans": false` to let them in; your own `bans` apply either way. On Linux the server needs `curl` installed to read the list.

## Updates

The server keeps itself on the latest ReSkate release. It checks at startup and every half hour, and installs a new version as soon as the server is empty, keeping your config, mods and logs. Players and the server must run the **same ReSkate version**, so leave `auto_update` on unless you have a reason not to.

## On Linux

Since **1.0.8** each release also ships `ReSkateServer-Linux-<version>.tar.gz`, the same server as a native x86_64 Linux binary. It needs no Wine and no game install. It was ported by juan and is documented in [README-linux](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README-linux.md).

```sh
tar -xzf ReSkateServer-Linux-<version>.tar.gz
cd ReSkateServer-Linux-<version>
./ReSkateServer      # writes ReSkateServer.json; set name and admins, then restart
```

The release archive already has the Steam libraries (`libsteam_api.so`, `steamclient.so` and friends), a `world-layers.json` for time-of-day sync, and a systemd unit. If you build the server yourself instead, `setup-linux-server-libs.sh` fetches the Steam libraries.

What's different from Windows:

- **No self-update.** `auto_update` and `update` don't work on Linux. Replace the folder when a new release comes out, because players must be on the same version, and keep your `ReSkateServer.json` and `Mods`.
- **Running as a service.** Copy `reskate-server.service` to `/etc/systemd/system/`, then `sudo systemctl enable --now reskate-server`.
- **Global bans** need `curl` on the machine.

## Community tools

- [ReSkate Manager](https://github.com/xThrasherrr/reskate-manager) by xThrasherrr runs ReSkate servers and gives you a web panel to manage them (GPL-3.0).
- [docker-reskate-server](https://github.com/dudedankdave/docker-reskate-server) is a Docker image that takes settings as environment variables. It uses host networking, because Steam's relay breaks behind bridge NAT.

These are third-party projects, not ReSkate's. Read them before running them.

Server hosts trade tips in the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX).
