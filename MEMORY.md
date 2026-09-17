# POLY-STRIKE project memory

Location: C:/Users/xtr18/Projects/poly-strike. Read before resuming; never store secrets.
Repo: https://github.com/xtr18222-hue/poly-strike
Pages: https://xtr18222-hue.github.io/poly-strike/ (main/root).

## Architecture and decisions
- Original procedural tactical FPS, not affiliated with Valve. Vanilla JS, vendored Three.js r149 and PeerJS 1.5.5 (MIT). No runtime CDN; offline file:// and SW caching.
- Exactly AK-47, AWP, Deagle, Butterfly Knife; all unlocked. Natural wood/steel, olive, silver, chrome colors replace red skins.
- maps.js registry: desert/Sandline, industrial/Ironworks, urban/Crossfire. core.js forMap returns cached collision/nav context; nav BFS reused across bots.
- visual factories return arena root/stats/dispose; merged material batches, hidden live raycast colliders retained. Performance basic materials, no textures/decorative effects, max 307200 render pixels. No postprocessing/shadow maps.
- settings.js persisted high/medium/performance budgets. game.js controller/HUD; net.js transport; duel.js host authority; online.js adapter. Network 20Hz, public PeerJS signaling/STUN, no TURN; restrictive NAT may fail. Codes not authentication; casual host trusted, no ranked anti-cheat.
- Offline five bots, 90 seconds, first5 rounds. Online 1v1 first5, higher HP wins timeout, equal draws. Online menus do not freeze match; no host migration.
- Shift sprint, C/Ctrl while sprinting slides; right-click AK/Deagle ADS + AWP scope. Faster reloads, exactly two alternating knife inspect variants.
- Desktop keyboard/mouse, pointer lock or drag fallback. Test mutations only ?test=1.

## Verified upgrade progress
- 62 Node tests pass, including 30 full-round seeded bot traces per map, collision/nav connectivity, model/material/batching/disposal, duel authority and packet/lifecycle validation.
- Upgrade UI/maps/presets/ADS/slide/knife/AK/reload browser suite passed with zero console/page errors.
- Real two-browser public PeerJS/WebRTC transport and integrated game passed host/join, damage both ways, movement, victory/defeat, disconnect.
- Offline cached reload, direct file:// and actual pointer lock passed. Original gameplay, integrated online, offline and pointer-lock suites passed again after final visual batching.
- Performance on this Windows Edge machine at1280x800: desert60.13, industrial60.21, urban60.18 FPS; p95 17.0–17.1ms; total draws157/157/110; framebuffer307038 pixels; reported JS heap10.7–14.0MB (NOT total process memory or 1GB-hardware certification).
- Screenshot visual assessment unavailable (vision model lacks support); numeric renderer/geometry tests are real. No universal60FPS/1GB claim.
- Independent review passed with no security/logic findings; final regressions passed. Live upgrade commit 33348c6 pushed; Pages rebuilt/verified. Previous initial commit f6fdaa5.

## Current polish pass
- Username input (20 chars, safe text rendering) persisted locally and replicated in online poses; scoreboard Name/Kills/Deaths/Score with persistent bot stats. Score=100 per kill+250 per round win. Made by XTR footer; menu order unchanged.
- Headshot metallic oscillator ding, amber special kill feed, source-relative red damage arc; radar shows all living opponents.
- Deagle falloff removed: 53 body damage (2 hits), headshot fatal; lower leg multiplier unchanged.
- inspection.js pure eased paths: AK2.6s/Deagle2.3s airborne roll, AWP3.2s vertical sweep, knife two1.5s variants. Hands independent sibling roots. SW includes module.
- Final polish verification: 72 Node tests passed; gameplay, feedback/inspections, username UI, radar pixels, offline/file/pointer-lock and real WebRTC tests passed. No runtime errors in completed browser runs. Performance final sample: 59.5–60.2FPS, p95 17.0–17.1ms, draws110–157 on local Edge (not low-memory certification).
- Model polish complete: beveled Deagle, tapered butterfly blade, bot armor/boots/visor; merged environment details and clouds skipped in Performance mode. Collision footprints unchanged.
- Independent scoped review passed with no security/logic findings. Nonblocking follow-ups: self-row highlight uses username equality; duplicate scoreboard CSS rules. Polish commit 88ea3ff pushed; Pages build confirmed for that SHA. Live username/scoreboard, combat feedback/inspections and offline suites passed; SW v3 cache.

## Toolchain/deploy
- Node24, Python3.11 via uv, Playwright installed Edge channel msedge.
- Portable gh: C:/Users/xtr18/AppData/Local/gh-portable/bin/gh.exe authenticated xtr18222-hue. Local git noreply identity configured.
- Server localhost18957; TEST_URL overrides browser suite roots (trailing slash).
- Bump sw.js CACHE every runtime deployment; current poly-strike-v3-polish. Reload after activation for previous cached clients.
- Ignore performance screenshots/results artifacts. Keep tests and licenses committed.
