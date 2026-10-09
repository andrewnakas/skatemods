---
question: Can I still play Skate 3 online?
answer: Yes. The quickest way is Skate 3 Online, a free browser build with multiplayer rooms for up to 10 players. To play the original PS3 game online, use RPCS3 with skate6743's community Blaze server. It restores matchmaking, friend invites and Skate.Park uploads. You point RPCS3 at it with a config tool, and everyone in a lobby has to use the same physics settings and game update.
category: skate-3
games: [skate-3, skate, skate-2]
related: [faq/rpcs3-basics, guides/skate-3-on-rpcs3, history/skate-3]
order: 13
updated: 2026-10-01
---

## In your browser

[Skate 3 Online](/skate-3-online/) runs a Skate 3 engine rewrite in Chrome or Edge with WebGPU: no disc, no download. Its **Multiplayer** menu opens a private room with an invite link, or a public room anyone can join, for up to 10 skaters on the same map. It isn't the retail game (the big districts aren't in it yet, and there's no music), but it's the fastest way to skate with friends.

## EA's servers

EA's own servers have been unreliable. They went down around 2016 and [came back in 2018](https://www.engadget.com/2018-06-06-ea-skate-3-servers-on.html) without an announcement. EA's [user agreement](https://www.ea.com/legal/user-agreement) promises 30 days' notice before a service shuts down. Don't count on official servers for anything long-term.

## The community Blaze server

[Skate3BlazeServer](https://github.com/skate6743/Skate3BlazeServer) is a "Skate 3 Custom Blaze server for [RPCS3](/faq/rpcs3-basics/)/PS3 with working matchmaking and content server features":

- "Functional matchmaking and player invites from friends list ingame"
- "Relay servers for each lobby (no Peer to Peer connections between players)"
- "Park uploading/downloading from the Skate.Park menu ingame"

It builds on Aim4Kill's BlazeSDK and isn't affiliated with EA.

## Connecting from RPCS3

- **Windows:** BWKingsnake's **Skate 3 Config Adjuster**, linked from the README, applies the online settings for you.
- **Manual:** paste the server's host overrides into RPCS3's network settings, set PSN status to **RPCN** and turn on UPnP, as the [README](https://github.com/skate6743/Skate3BlazeServer) describes.
- **Match everyone else.** "Any setting that affects physics that you have set to different value will cause you to desync out of all lobbies immediately." Players on the old 1.00 update are also matched separately from 1.05 players.

## skate and skate 2

skate6743 also maintains an [Arcadia fork](https://github.com/skate6743/arcadia-skate) that brings online play back to the first two games. It comes with a server-IP changer for HEN and CFW PS3s.
