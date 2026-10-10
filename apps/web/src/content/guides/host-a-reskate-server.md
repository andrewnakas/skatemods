---
title: "ReSkate server: host a dedicated server on PC or Linux"
description: Run a ReSkate dedicated server for skate. (2025) on Windows or Linux, updated for 2.0. It covers the config file, custom maps and map pools, admins, votes and polls, login tokens, global bans, the fair-play checks and Pterodactyl. It needs no game install and no open ports.
game: skate-2025
level: intermediate
order: 7
updated: 2026-10-10
downloads:
  - { label: "ReSkateServer for Windows or Linux (latest release)", url: "https://github.com/Dingo-Shenanigans/ReSkate/releases/latest", note: "ReSkateServer-<version>.zip, or ReSkateServer-Linux-<version>.tar.gz" }
  - { label: "Server manual (README.txt)", url: "https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README.txt", note: "every setting and command" }
  - { label: "Your SteamID64", url: "https://steamid.io/", note: "to make yourself an admin" }
  - { label: "Steam game server login token", url: "https://steamcommunity.com/dev/managegameservers", note: "optional; App ID 3354750, one per server" }
  - { label: "Pterodactyl egg", url: "https://github.com/Dingo-Shenanigans/ReSkate/tree/main/contrib/pterodactyl", note: "for Pterodactyl and Pelican panels" }
---

ReSkate ships a headless dedicated server, `ReSkateServer.exe`, that shows up in every player's in-game browser (**Multiplayer → Servers**). It needs **neither the game nor Steam installed**, and players connect through Steam's relay network, so you don't have to open any ports. This guide follows the official [server manual](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README.txt) for ReSkate **2.0.2**. There's a native [Linux build](#on-linux) too. [What changed in 2.0](/blog/reskate-2/) has the full list of new server features.

## Set it up

1. Download `ReSkateServer-<version>.zip` from [ReSkate's releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest) and unzip it into its own folder.
2. Keep the folder together. `steam_api64.dll`, `steamclient64.dll`, `tier0_s64.dll` and `vstdlib_s64.dll` are how the server talks to Steam, and `world-layers.json` lets it set time of day and other world layers for everyone.
3. Run `ReSkateServer.exe` once. It writes `ReSkateServer.json` next to itself.
4. Edit that file. At minimum, set `server.name` and add your SteamID64 to `access.admins`. Paste your Steam profile URL into [steamid.io](https://steamid.io/) to find it.
5. Start the server again. Players find it by name in the browser.

By default the server signs in to Steam anonymously and gets a new Steam ID, and so a new join code, every time it starts. The browser always finds it by name. To keep the same ID and code, see [Login tokens](#login-tokens). If you forward **UDP 27015–27016** anyway, the browser also shows your ping and joins are a little faster.

## A starter config

Since 1.1.7 the file is split into sections. A config from an older version is read as it is and rewritten in sections the first time the server starts.

```
{
  "server": {
    "name": "Port Carverton Sessions",
    "password": "",
    "welcome_message": "Be cool. /vote map to change maps.",
    "listed": true,
    "max_players": 32,
    "steam_token": ""
  },
  "access": {
    "admins": ["76561198000000000"]
  },
  "maps": {
    "map": "San Vansterdam",
    "pool": ["San Vansterdam", "Isle of Grom", "bbcity"],
    "rotation_minutes": 30,
    "world_layer_sync": true
  },
  "players": {
    "object_placement": "everyone",
    "object_limit": 100,
    "afk_kick_minutes": 20
  },
  "anti_cheat": {
    "speed_hack": "warn",
    "modified_scoring": "warn"
  },
  "votes": {
    "map": { "enabled": true, "percent": 60 },
    "time_of_day": { "enabled": true, "percent": 50 },
    "polls": "admins"
  }
}
```

Any key you leave out keeps its default, and changes made from the console or by an admin in game are saved back to the file. Start the server with `--config grom.json` to run it from another file. The useful keys:

| Section | Key | What it does |
|---|---|---|
| `server` | `name` | 1–64 letters, numbers, spaces and `- _ / [ ] ( )` |
| `server` | `password`, `listed` | Lock it, or hide it from the browser so players need the code |
| `server` | `max_players` | 1–249 |
| `server` | `steam_token` | A Steam login token, so the server keeps its ID and code |
| `server` | `auto_update` | Install new ReSkate releases when nobody's on (default true) |
| `server` | `chat_color`, `chat_text_color` | Colours of the server's own chat lines |
| `access` | `admins`, `reserved_players_slots` | Admins, and players who can join a full server |
| `access` | `use_global_bans` | Turn away players on the ReSkate team's ban list (default true, see below) |
| `maps` | `map` | `"San Vansterdam"`, `"Isle of Grom"`, `"Super Ultra Mega Resort"`, `"Stadium 1"`, or a custom map |
| `maps` | `pool`, `rotation_minutes` | The maps players vote between, and a timer to rotate through them |
| `players` | `allow_noclip`, `allow_no_bail`, `allow_boosts` | What players may use (admins always can) |
| `players` | `object_placement`, `object_limit` | Who can build (`everyone`, `admins` or `nobody`) and how many objects each |
| `players` | `allow_voice_chat`, `voice_range` | Proximity voice, 50–1000 m |
| `players` | `allow_parties`, `party_size` | Player parties, 2–8 per party |
| `players` | `afk_kick_minutes` | Remove players who've been away that long (0 is never) |
| `anti_cheat` | `speed_hack`, `modified_scoring`, `enforce_tuning` | The [fair-play checks](#fair-play) |
| `network` | `use_steam_relay` | `false` lets players connect straight to your UDP port for lower ping |
| `votes` | `map`, `kick`, `time_of_day`, `custom`, `polls` | Player votes, each off until enabled |

Since 1.1.5 servers run at a fixed 20 updates a second, so the old `tps` setting is gone.

## Custom maps

Copy a map's mod folder from the game's `Mods` folder into a `Mods` folder next to the server. The server only reads its `reskate-levels.json`, so it doesn't need the map data. Then set `maps.map` to the map's name (for example `"bbcity"`), or switch to it with `map <name>`. **Every player needs the same map mod installed** to join, so link it in your `welcome_message`.

### Map pools and rotation

`maps.pool` lists the maps players can vote for, in order. With `rotation_minutes` set, the server moves to the next map in the pool on a timer. Players get a minute's warning, and the clock waits while nobody is on. Manage it from the console with `map-pool add <map>` and `rotation 30`. Admins can still change to any map.

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
msg <player> <text>    private message (players whisper with /w)
announce <text>        a chat line and a card on every screen
poll Next map? | Grom | Stadium    ask everyone, 2–6 answers
afk-kick 20            remove players away for 20 minutes
update                 install a new release now
```

`help` lists every command. Players vote with `/vote map <map>`, `/vote kick <player>` or `/vote tod <time>`, then `/yes` or `/no`, or with the keys shown on the vote card at the right of the screen. Admins can't be vote-kicked.

### Custom votes, polls and chat commands

Since 2.0.2 you can define your own votes in `votes.custom`. Each one runs a server command when it passes, and players can only pick from the `choices` you list. For example, `{"name": "restart", "command": "map {map}", "percent": 60}` lets players vote to reload the map with `/vote restart`. `/poll` asks a question with up to six answers, and `votes.polls` sets who may start one. The `commands` section adds chat commands such as `/discord` or `/rules`. The `announcements` section posts messages on a timer. The [server manual](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README.txt) has the full syntax.

## Login tokens

Without a token, the server gets a new Steam ID and join code on every start. Make a token at [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers) with App ID **3354750**, one per running server, and put it in `server.steam_token`. The server then keeps the same ID, printed at startup. Keep the token private, because anyone with it can sign in as your server.

The ReSkate team can set the in-game browser to show only servers with a token. If that hides yours, the server says so in its log, and players can still join with the code.

## Fair play

The server runs three checks to keep throwdowns and co-op challenges fair:

- **`speed_hack`** catches games running faster than normal, such as Cheat Engine's speedhack, from the timing of what they send.
- **`modified_scoring`** flags players whose mods change trick scoring or skater physics. Each player's ReSkate checks its own mods at launch and reports when joining.
- **`enforce_tuning`** (on by default) keeps everyone on the game's own physics tuning, so edited truck settings don't show up on anyone's skater.

`warn` (the default) takes flagged players out of throwdowns and co-op until they're clean and tells the admins, `kick` removes them, and `off` disables the check. If your server is built around a scoring mod everyone installs, add its fingerprint with `score-allow`.

Newer limits cover what other players see. `bone_scale_limit` (default 2) caps how far a mod may resize parts of a skater for everyone else, so other players see a "big head" mod at no more than that scale. Its owner still sees it in full. `bone_reach_limit` stops a hacked game from stretching its skater across the map. A player who places objects far faster than normal has them deleted for everyone.

### Global bans

Since **1.1.1**, servers also read the ReSkate team's own multiplayer ban list from `api.reskate.dev`, at startup and every ten minutes, and turn those players away. Steam lobbies hosted from the game do the same. It's on by default. Set `access.use_global_bans` to `false` to let them in. Your own bans, kept in `data/bans.json`, apply either way. The same list carries words that are never passed on in chat. `players.word_warnings` sets how many warnings a player gets before a kick. On Linux the server needs `curl` installed to read the list.

## Updates

The server keeps itself on the latest ReSkate release. It checks at startup and every half hour, and installs a new version as soon as the server is empty, keeping your config, mods and logs. Players and the server must run the **same ReSkate version**, so leave `auto_update` on unless you have a reason not to. The multiplayer protocol changed four times between 1.1.5 and 2.0.2, so an out-of-date server turns new players away.

## On Linux

Since **1.0.8** each release also ships `ReSkateServer-Linux-<version>.tar.gz`, the same server as a native x86_64 Linux binary. It needs no Wine and no game install. It was ported by juan and is documented in [README-linux](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README-linux.md).

```sh
tar -xzf ReSkateServer-Linux-<version>.tar.gz
cd ReSkateServer-Linux-<version>
./ReSkateServer      # writes ReSkateServer.json; set name and admins, then restart
```

The release archive already has the Steam libraries (`libsteam_api.so`, `steamclient.so` and friends), a `world-layers.json` for time-of-day sync, and a systemd unit. If you build the server yourself instead, `setup-linux-server-libs.sh` fetches the Steam libraries.

What's different from Windows:

- **Self-update since 1.1.4.** A server from a release tarball updates itself like the Windows one and keeps running in the same process, so systemd doesn't notice. It needs `curl` and `tar` on the machine. A server you built from source never replaces itself.
- **Running as a service.** Copy `reskate-server.service` to `/etc/systemd/system/`, then `sudo systemctl enable --now reskate-server`.
- **Global bans** need `curl` on the machine.

### Pterodactyl and Pelican

Since 2.0, ReSkate ships an [egg](https://github.com/Dingo-Shenanigans/ReSkate/tree/main/contrib/pterodactyl) for the Pterodactyl and Pelican game-server panels, written by wildesPepega ([#103](https://github.com/Dingo-Shenanigans/ReSkate/pull/103)). It installs the Linux server from the release, checks it by SHA-256, and keeps the panel's port, query port and `steam_token` in `ReSkateServer.json`.

## Community tools

- [ReSkate Manager](https://github.com/xThrasherrr/reskate-manager) by xThrasherrr runs ReSkate servers and gives you a web panel to manage them (GPL-3.0).
- [docker-reskate-server](https://github.com/dudedankdave/docker-reskate-server) is a Docker image that takes settings as environment variables. It uses host networking, because Steam's relay breaks behind bridge NAT.

These are third-party projects, not ReSkate's. Read them before running them.

Server hosts trade tips in the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX).
