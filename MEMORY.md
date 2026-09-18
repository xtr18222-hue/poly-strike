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

## Kar98k update (current pass)
- Kar98k integrated as the fifth weapon: unscoped bolt-action sniper, 5/40 ammo, 1.2s fire interval, 2.4s reload, turned bolt + tangent iron sights, wood/blued steel model, real builder in visuals.js (no longer an AWP alias). Menu loadout select, Digit1 slot, drop/pickup and online buy/lock all wired.
- Damage model: core.js exports shotDamage(weapon,part,dist) and rollVariance(dist); playerShot (offline) and duel.shoot (online host authority) both call it, so host and client settle identical numbers. Headshots: multiplier only, no falloff, no variance → guaranteed kill at any range (Kar98k min 198 at 200m). Body/leg hits add deterministic per-distance variance (pure hash of distance, no RNG state consumed), giving Kar98k ~84% body-kill point-blank falling to ~16% at long range; leg hits never one-shot. Weapons without a `variance` field compute exactly the previous formula (0 regressions verified).
- Kar98k stats: damage 110, headMult 2.5, legMult 0.75, falloff 0.0014, variance 0.12, zoomFov 32, ADS (no scope overlay), price 3400.
- Inspections: inspection.js now has an explicit ak47/deagle branch sharing the sniper vertical-sweep family with a full 2π airborne roll and a tactical magazine detach/reseat (AK only; Deagle has no mag userData). Durations ak47 3.0s, deagle 2.7s, awp 3.2s, kar98 3.4s, knife 1.5s. All endpoints stationary and continuous; hands remain sibling roots.
- Fixed two pre-existing test failures that blocked `node --test`: tests/core.test.cjs asserted exactly four weapons, and visuals.js exported an undefined buildCasing (ReferenceError killed the whole visuals.cjs file). buildCasing is now a real brass-casing factory used by the sniper shell-eject effect.
- Stale Playwright suites repaired to the real loadout slots (Digit1 primary / Digit2 Deagle / Digit3 knife; Digit4 never existed) and to headshot aim via drag-look: gameplay.py, feedback.py, upgrade.py. New tests/kar98.py covers Kar98k mechanics, variable body outcomes and all inspections.
- Verification: 86 Node tests pass (was 56/54). Browser suites pass: gameplay, feedback, upgrade, offline, radar, polish_ui, expansion, network, online_game (real WebRTC), performance (56.0-56.3 FPS, draws 157/157/110, heap 13.0-16.1MB, Performance mode). Not committed/pushed yet.
- Deploy note: sw.js CACHE bumped to poly-strike-v4-kar98; README corrected to five weapons, Kar98k section added, controls slot numbers fixed.

## Unscoped Kar98k + cinematic inspection + tactical reload (current pass)
- Kar98k is now completely unscoped in both stats and model: `zoomFov: null`, `ads: true` in core.js, and the scope body replaced in visuals.js by a low iron-sight rail with protective ears plus tangent front/rear posts. ADS right-click raises iron sights exactly like the AK-47 — no scope overlay, no zoom. `game.js` uses `scopedOnly(k)=>k==='awp'` (was `sniper(k)`, which treated kar98 as scoped), so only the AWP is scoped. Kar98k damage profile is unchanged: headshot guaranteed kill, variable body damage via the deterministic distance hash, leg multiplier retained.
- Inspection system rewritten in inspection.js as one unified cinematic sequence for all five weapons: weapon brought forward and out to the support side, tilted through three poses (receiver → barrel → side), eased back on C2 curves. Pose endpoints are exactly the identity at t=0 and t=1, all paths finite and bounded; knife keeps its two butterfly flip variants. Tests updated: tests/inspection.cjs rewritten to the new invariants; deagle duration moved 2.7 → 2.5s (also in tests/kar98.py).
- Tactical magazine swap in game.js: reload now runs in three stages — detach, hold-open, seat. The spent mag is thrown into the world as a pooled procedural mesh (visuals.js `buildMagazine`, curved AK / straight Deagle variants) with gravity, inheriting player velocity. AWP/Kar98k keep bolt handling (internal magazine) and skip the drop.

## Training Mode (fourth map)
- maps.js adds `training`: an open firing range (firing lane + cover crates + target wall) with its own palette and nav graph; its mid-cover crates are offset from the 4m nav grid so bots never clip a corner (the 30-seed collision trace test caught this at frame 459).
- core.js adds `createTrainingMatch(map)`: static targets (`speed 0`, `cool 999`) that never return fire, no round clock (Infinity), no score pressure, 2.5s target respawn. `forMap('training')` binds `createTrainingMatch` and the nav graph.
- game.js wires it: deploy picks `createTrainingMatch` when `C.MAP.training`, HUD objective reads "TRAINING · N TARGETS READY" and the clock freezes at 0, syncBots runs instead of round-end logic. Both map selects (`mapSelect`, `nextMap`) and the online map rotation list it fourth, so the net.cjs rotate test now expects urban → training.
- Covered by tests/training.py: four-map order, no scope overlay, no score/round pressure, targets never fire, unscoped Kar98k ADS and one-shot kill, tactical reload, F inspection, and render budget (307,038 px / 59 draw calls). Read `Game.state().alive` ~400ms after the shot — training targets respawn after 2.5s, so a longer wait reads 1→4 instead of 1→0.

## Toolchain/deploy
- Node24, Python3.11 via uv, Playwright installed Edge channel msedge.
- Portable gh: C:/Users/xtr18/AppData/Local/gh-portable/bin/gh.exe authenticated xtr18222-hue. Local git noreply identity configured.
- Server localhost18957; TEST_URL overrides browser suite roots (trailing slash).
- Bump sw.js CACHE every runtime deployment; current poly-strike-v6-overhaul (was v5-training). Reload after activation for previous cached clients.
- Ignore performance screenshots/results artifacts. Keep tests and licenses committed.

## AAA overhaul (current pass)
- Kar98k model fully rebuilt in visuals.js: classic two-piece walnut stock, blued steel, full-length stepped barrel with hooded front sight, tangent rear sight, turned-down bolt handle. Stats unchanged (`zoomFov:null, ads:true`); right-click ADS raises iron sights like the AK, no overlay/zoom, spread tightens via `pickSpread`'s `scoped && w.ads` branch.
- Main menu is now strictly: Play Offline / Play Online / Loadout / Settings. Legacy `#primarySelect` dropdown removed everywhere (index.html + game.js). upgrade.py and polish_ui.py assert the new order.
- Loadout hub (index.html `#loadoutPanel`, game.js): dedicated second Three.js scene + scissor-rendered `#loadoutCanvas` preview, primary cards (AK-47/AWP/Kar98k) and secondary cards (Deagle/Knife), live Inspect Weapon button drives the same PolyInspection poses, selections persist to localStorage (`poly-primary`/`poly-secondary`) and feed `inventory()`. Career stats (`poly-career`) recorded by `recordCareer(won)` in finishMatch; Career/Stats button on the pause menu.
- inspection.js: firearms share one new cinematic sequence (receiver → chamber → sides, C2 easing, exact identity endpoints); knife's two flip variants untouched. durations are now ak47 3.4 / deagle 2.6 / awp 3.6 / kar98 3.8 / knife 1.5 — tests/kar98.py asserts the new values.
- audio.js: distinct dry-fire cue (`dry` 2400Hz + double metallic tick) on empty trigger pull; new `switch` foley for weapon swaps.
- game.js QoL: pooled bullet decals (`spawnDecal`, 48 cap, surface-oriented, fade 6s), ammo counter colour gradient (white→amber→red by `rounds/cap`), low-health vignette (`body.low-health` + pulsing `#damage` opacity below 25 hp), faster switch (`equip .35`, `A.sound('switch')`), crosshair customization (colour/gap/length/thickness/dot, `poly-crosshair`, applied via `applyCrosshair`).
- tests/overhaul.py added: 24 checks for loadout hub, crosshair persistence, career panel, dry-fire, vignette, decals, fast switch — all PASS, zero console/page errors. All other suites green (89 node, kar98/upgrade/polish_ui/gameplay/feedback/offline/radar/performance/training/expansion/online_game).
