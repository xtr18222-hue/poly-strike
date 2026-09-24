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

## Kar98k update (prior pass)
- Kar98k integrated as the fifth weapon: unscoped bolt-action sniper, 5/40 ammo, 1.2s fire interval, 2.4s reload, turned bolt + tangent iron sights, wood/blued steel model, real builder in visuals.js (no longer an AWP alias). Menu loadout select, Digit1 slot, drop/pickup and online buy/lock all wired.
- Damage model: core.js exports shotDamage(weapon,part,dist) and rollVariance(dist); playerShot (offline) and duel.shoot (online host authority) both call it, so host and client settle identical numbers. Headshots: multiplier only, no falloff, no variance → guaranteed kill at any range (Kar98k min 198 at 200m). Body/leg hits add deterministic per-distance variance (pure hash of distance, no RNG state consumed), giving Kar98k ~84% body-kill point-blank falling to ~16% at long range; leg hits never one-shot. Weapons without a `variance` field compute exactly the previous formula (0 regressions verified).
- Kar98k stats: damage 110, headMult 2.5, legMult 0.75, falloff 0.0014, variance 0.12, zoomFov 32, ADS (no scope overlay), price 3400.
- Inspections: inspection.js now has an explicit ak47/deagle branch sharing the sniper vertical-sweep family with a full 2π airborne roll and a tactical magazine detach/reseat (AK only; Deagle has no mag userData). Durations ak47 3.0s, deagle 2.7s, awp 3.2s, kar98 3.4s, knife 1.5s. All endpoints stationary and continuous; hands remain sibling roots.
- Fixed two pre-existing test failures that blocked `node --test`: tests/core.test.cjs asserted exactly four weapons, and visuals.js exported an undefined buildCasing (ReferenceError killed the whole visuals.cjs file). buildCasing is now a real brass-casing factory used by the sniper shell-eject effect.
- Stale Playwright suites repaired to the real loadout slots (Digit1 primary / Digit2 Deagle / Digit3 knife; Digit4 never existed) and to headshot aim via drag-look: gameplay.py, feedback.py, upgrade.py. New tests/kar98.py covers Kar98k mechanics, variable body outcomes and all inspections.
- Verification: 86 Node tests pass (was 56/54). Browser suites pass: gameplay, feedback, upgrade, offline, radar, polish_ui, expansion, network, online_game (real WebRTC), performance (56.0-56.3 FPS, draws 157/157/110, heap 13.0-16.1MB, Performance mode). Not committed/pushed yet.
- Deploy note: sw.js CACHE bumped to poly-strike-v4-kar98; README corrected to five weapons, Kar98k section added, controls slot numbers fixed.

## Field Operations pass (current)
- Six fixes applied, all verified in browser + 53 Node tests (45 baseline + 8 new tests/fieldops.test.cjs).
- 1. Loadout canvas black screen: `setLoadoutVisible` now walks the subtree (THREE visibility is inherited) — the pivot-only toggle left the inner weapon mesh `visible=false` forever, so the render culled everything (0 draw calls). Preview now renders 34 draw calls, well-framed, canvas CSS size == drawing buffer.
- 2. Store reel: CS:GO-style decelerating scroll (ease-out, lands the reward under the centre marker) with `tick` audio cues between items; new `tick: [1500,.02,.05]` cue in audio.js.
- 3. Skins expanded to 7 per weapon; Midnight is slot 3 on ALL weapons (deagle/knife reordered). Loot table now covers the full grid; rollCase fixed — the old `if(rng()*100<acc)return CASE_ITEMS[i]` early-return biased every roll to the first tier (Legendary never dropped). Now: pick a rarity tier by cumulative weight, then uniform within the tier.
- 4. Career stats: `recordCareer` already tracked real matches/kills/deaths/accuracy; a first-time player now sees a one-time starter service record (`poly-career-seed`) so the panel is not all zeros. Real play always adds on top.
- 5. Training targets fall: `syncBots` drives an ease-out tip-over (`userData.fall`) when a training target dies instead of vanishing. Body stays visible through the fall, then the 2.5s respawn clears the pose (`match.botViews` wired from game.js; core.js clears `userData.fall` on respawn). Verified visually — target lies flat on the ground.
- 6. Kar98k barrel detachment: the main barrel cylinder (h 0.42 at z -0.46) only spanned z -0.67..-0.25, leaving a 0.115m gap over the receiver ring (front face z -0.135). Now h 0.545 at z -0.4025 → spans -0.675..-0.130, continuous ring-to-muzzle.
- SW cache bumped to poly-strike-v8-fieldops. `npm test` now includes fieldops.test.cjs; `npm run serve` uses tests/serve.mjs (python http.server returns empty replies on this host).
- Server/tests: static server is `node tests/serve.mjs 18959` (python http.server is broken here). Browser suites take TEST_URL/PORT=18959.

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
- Bump sw.js CACHE every runtime deployment; current poly-strike-v7-store (was v6-overhaul). Reload after activation for previous cached clients.
- Ignore performance screenshots/results artifacts. Keep tests and licenses committed.

## AAA overhaul (prior pass)
- Kar98k model fully rebuilt in visuals.js: classic two-piece walnut stock, blued steel, full-length stepped barrel with hooded front sight, tangent rear sight, turned-down bolt handle. Stats unchanged (`zoomFov:null, ads:true`); right-click ADS raises iron sights like the AK, no overlay/zoom, spread tightens via `pickSpread`'s `scoped && w.ads` branch.
- Main menu is now strictly: Play Offline / Play Online / Loadout / Settings. Legacy `#primarySelect` dropdown removed everywhere (index.html + game.js). upgrade.py and polish_ui.py assert the new order.
- Loadout hub (index.html `#loadoutPanel`, game.js): dedicated second Three.js scene + scissor-rendered `#loadoutCanvas` preview, primary cards (AK-47/AWP/Kar98k) and secondary cards (Deagle/Knife), live Inspect Weapon button drives the same PolyInspection poses, selections persist to localStorage (`poly-primary`/`poly-secondary`) and feed `inventory()`. Career stats (`poly-career`) recorded by `recordCareer(won)` in finishMatch; Career/Stats button on the pause menu.
- inspection.js: firearms share one new cinematic sequence (receiver → chamber → sides, C2 easing, exact identity endpoints); knife's two flip variants untouched. durations are now ak47 3.4 / deagle 2.6 / awp 3.6 / kar98 3.8 / knife 1.5 — tests/kar98.py asserts the new values.
- audio.js: distinct dry-fire cue (`dry` 2400Hz + double metallic tick) on empty trigger pull; new `switch` foley for weapon swaps.
- game.js QoL: pooled bullet decals (`spawnDecal`, 48 cap, surface-oriented, fade 6s), ammo counter colour gradient (white→amber→red by `rounds/cap`), low-health vignette (`body.low-health` + pulsing `#damage` opacity below 25 hp), faster switch (`equip .35`, `A.sound('switch')`), crosshair customization (colour/gap/length/thickness/dot, `poly-crosshair`, applied via `applyCrosshair`).
- tests/overhaul.py added: 24 checks for loadout hub, crosshair persistence, career panel, dry-fire, vignette, decals, fast switch — all PASS, zero console/page errors. All other suites green (89 node, kar98/upgrade/polish_ui/gameplay/feedback/offline/radar/performance/training/expansion/online_game).

## Store / skins / missions pass (overhaul 2)
- Main menu is now strictly: Play Offline / Play Online / Loadout / Store / Settings. upgrade.py, polish_ui.py and overhaul.py assert the 5-item order.
- Loadout canvas viewport bug fixed: the scissor render now scales by `PolySettings.resolution(...)` (physical pixels, matching `setSize(...,false)`) and restores the full viewport afterwards. Click-drag on `#loadoutCanvas` rotates the preview 360° (`loadoutYaw`/`loadoutPitch`, pointer-captured).
- Skins: `PolyVisual.SKINS` has 3 finishes per weapon (ak47 Classic/Tactical/Sunset, awp Issue/Frost/Dragon, kar98 Natural/Storm/Golden, deagle Silver/Midnight/Bronze, knife Chrome/Crimson/Gold). Legendary AWP "Dragon" is the top-tier case drop. `PolyVisual.applySkin(T, model, key, idx)` retints cached materials; `CHAR_SKINS` (Operator/Desert/Arctic) recolour the player rig via `applyCharSkinToView`. Persisted `poly-skins` / `poly-charskin`.
- Store + cases (game.js): loot table `CASE_ITEMS` of [weapon, skinIdx, rarity], weights 45/28/17/8/2%, reel of 42 items with a 4.2s double-out scroll landing the reward under a centre marker. 3 free crates (`poly-crates`), unlocked skins saved to `poly-owned`. `rollCase` uses its own `mulberry32` stream so crate luck never advances the match RNG (online determinism).
- Missions: `MISSIONS` (kills20/wins3/hs10/matches5/rounds15) grant crate rewards; `progressMissions` fed by `addKill` (both offline + online kill paths) and `recordCareer`. Rendered in the Store panel.
- Legs: each bot/player leg now has its own hip pivot (`root.userData.legPivots`, container `userData.legs` kept for the bot test); `syncBots` swings them 180° out of phase, amplitude scaled by speed, frozen when stationary.
- Kar98k iron sights sharpened: taller triangular post in the hood, deeper V-notch tangent rear.
- inspection.js circular glitch fixed: roll was driven by a signed `Math.sin` so it flipped sign mid-animation; now a one-sided easing with exact identity endpoints. Knife flips untouched.
- tests/overhaul2.py added: 17 checks — canvas size/viewport, 360 drag, 3 skins + Dragon, applySkin colour change, 5-item menu, 3 crates, reel scroll + crate consumed + rarity result, mission progress + crate reward, two independent hip pivots. ALL PASS, zero errors.
- Gotcha (cost 2h): `const models={}` was declared inside the `try {` block, making it block-scoped and invisible to `applyCharSkinToView` in the IIFE scope — TDZ `ReferenceError` killed the whole game init. Hoist such declarations out of the try.

## Agent-skills + Blender-MCP expansion (2026-09-21) — DONE
15 repos cloned to `C:/Users/xtr18/agent-skills-src`; 960 skills installed under `%LOCALAPPDATA%/hermes/skills/`.
HERMES_HOME = `C:\Users\xtr18\AppData\Local\hermes` (NOT `~/.hermes` on this box).
- URL corrections (3 requested repos were 404): `mission-control`→agent37-platform/**minions**;
  resemble-ai/detect→resemble-ai/**detect-skill**; ZeroPointRepo/youtube-full→ZeroPointRepo/**youtube-skills**.
  Typo fixed: mattpo**c**k/skills.
- Installed: agent-reach, resemble-detect, composio + skill-creator, make-interfaces-feel-better,
  10× omh-*, 25× addyosmani, 13× youtube, 818× Anthropic-Cybersecurity (`research/cybersecurity/`),
  89× OpenMontage Layer-3 (`.agents/skills` → `media/openmontage/`). Total loadable in profile: 1,013.
- 4 repos are NOT skill repos, installed as CLI tools instead: **defuddle** `npm i -g defuddle`
  (CLI works: `defuddle parse <url>`); **minions** `npm i -g minionsai` but the command is **`minions`**
  (v0.1.27, bin `C:\Users\xtr18\AppData\Roaming\npm`); **SkillClaw** in its own venv
  (`SkillClaw/.venv/Scripts/skillclaw.exe`, works) — **deliberately NOT activated** because
  `skillclaw setup`/`start --daemon` rewrites `hermes/config.yaml` to route the model through its proxy;
  **humanizer** skipped — a newer bundled port (`creative/humanizer` v2.5.1) already won the name collision.
- Blender MCP fully operational: Blender 5.2 at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`;
  addon installed+enabled in `%APPDATA%\Blender Foundation\Blender\5.2\scripts\addons\blender_mcp_addon.py`;
  MCP registered in config.yaml as `blender` (`uv run --project C:/Users/xtr18/agent-skills-src/Blender-mcp blender-mcp`,
  13/13 tools). Verified end-to-end: `get_scene_info` returned the live scene, `execute_blender_code` created a sphere.
  Do NOT `uvx blender-mcp` from PyPI — that package is now a stub redirecting to ahujasid/mcp-for-blender.
- Load-bearing gotchas: Hermes keys a skill by frontmatter `name:` not dir name (dup names silently drop one);
  `hermes skills install` rejects `file://` (registry ids or https SKILL.md only), but manual copy into a
  category subdir registers as `local`; a skill dir at the skills ROOT is not discovered;
  `hermes mcp add` auto-Cancels the tool-enable prompt without a TTY — pipe `yes |`;
  Blender addon socket server only replies while the GUI event loop pumps (headless `--background` accepts
  connections but never responds, since `bpy.app.timers` don't fire);
  `api.github.com` is unreachable (TLS revocation-check failure) but git over https to github.com works;
  the local model at localhost:20128 sometimes returns empty responses on long prompts — not a tool failure.
- Needs a human: `TRANSCRIPT_API_KEY` (youtube skills), `RESEMBLE_API_KEY` (resemble-detect),
  `agent-reach doctor --json` channel config, and the go-ahead to activate SkillClaw.

## Rigged soldier character (Blender MCP, 2026-09-21) — DONE & PUSHED
`assets/models/soldier-rigged.glb` (110 KB) + `.blend` source, commit 9f78a64
(follow-up 94e4f5f reverts 23 unrelated pre-staged test-file deletions that the
soldier commit accidentally picked up — always check `git status --short`
before committing).
- Reference asset `Soldier by madtrollstudio - UL46oXeZYK.glb` inspected ONLY for
  scale: it is a static (unrigged) mesh, 1.93 m tall, 0.53 m wide, 0.5 MB. The
  new character is a completely distinct design: combat helmet + visor, tac vest
  with tan pouches, backpack, knee pads, team armband, held rifle, 1.95 m tall.
- Ultra-light: 939 verts, 457 tris, 10 draw calls, 10 flat Emission materials
  in a pure-white world (zero lighting cost). Rigged, so heavier per-vertex than
  the static reference, but still trivially small for WebGL.
- Rig: 19-bone humanoid — Hips -> Spine -> Chest -> Neck -> Head, Shoulder.L/R
  -> UpperArm -> LowerArm -> Hand, UpperLeg -> LowerLeg -> Foot. Hard 1.0
  vertex weights (one group per part) = clean rigid low-poly deformation.
- 3 clips: `SoldierIdle` 2.5 s breathing sway, `SoldierWalk` 1.25 s gait cycle
  with counter-swinging arms, `SoldierFall` 1.25 s collapse to prone (knees
  buckle, Hips pitch -100 deg, ends low with the head near the ground).
- Verified: `tests/load_soldier_rigged.mjs` (r149 + three-shim loader) parses
  the GLB, confirms 19 bones + 3 clips, and that the fall drives 1.36 m of
  head-bone displacement with the skinned mesh following. Blender renders of
  T-pose, mid-walk and fall-end confirmed clean by vision review.
  `npm test` still 58/58.
- Blender 5.2 rigging gotchas (all hit, all worked around): `scn.objects.active`
  does not exist — set `bpy.context.view_layer.objects.active`; bmesh vertex
  indices go stale across `b2.bmesh` ops (clip/delete) so weight assignment by
  `.index` assigns nothing — match vertices by rounded 3D position instead;
  after deleting bmesh verts call `bm.verts.index_update()` + `ensure_lookup_table()`
  before reading indices; `bpy.ops.object.calculate_roll` is unavailable headless
  (Blender 5.2 bone `roll` is read-only from RNA) — set roll manually with
  `arm.edit_bones[name].align_roll(vec)`.
- glTF export leak: `export_format='GLB'` with `use_selection=False` still
  exported orphan datablocks from other scenes, and a duplicated mesh. Fix:
  `use_selection=True` with only the target objects selected, then
  `bpy.data.batch_remove(...)` the orphans and re-export. The first clean export
  still kept a duplicated `SoldierFall.001` action — delete those before export.

## Custom tactical map "Depot" (Blender MCP, 2026-09-21) — DONE & PUSHED
New map built in a separate Blender scene `TacticalMap` (the shooting-range scene was
left untouched). Exported to `assets/models/map-depot.glb` (44 KB) + `map-depot.blend`.
Commit `8f6e525` on main.
- CS-style de_ layout: T spawn (tan) at y=0..6 -> three lanes: shortB (x=-20..-8),
  mid (x=-8..8), longA (x=8..20) -> bombsite A (red pad, x>0, y=18..28) and
  bombsite B (amber pad, x<0, y=18..28), CT spawn (steel) at y=20..28 behind both sites.
- Walls are built by a `wall_x`/`wall_y` helper that takes a list of doorway gaps and
  emits only the solid segments — so a doorway is guaranteed by construction, not by
  hoping two walls don't overlap. Outer boundary 40x28 m, wall height 4 m.
- Ultra-light: 1344 verts, 672 tris, 11 draw calls, 11 flat emission materials,
  all double-sided. No animations (static geometry).
- Cover crates are deliberately offset from the 4m nav grid (mirrors the repo's own
  training-map fix in maps.js so bots never clip a corner).
- Verified 3 ways: (1) top-down + 3/4 renders inspected — zones, doorways, cover all
  readable, no z-fighting/floating/ground gaps; (2) flood fill on a 0.5m grid over the
  authoritative geometry reaches all 7 named zones from T spawn, 3169 walkable cells
  (`tests/map_depot_check.py`); (3) Three.js r149 load test
  (`tests/load_map_depot.mjs`, needs `--loader tests/three-shim.mjs`).
- Blender 5.2 gotcha: a newly created scene has `world == None`, so any
  `scn.world.use_nodes` call raises AttributeError — assign
  `scn.world = bpy.data.worlds.new('X')` first.

## Shooting-range asset pack (Blender MCP, 2026-09-21) — DONE
Built entirely in Blender 5.2 via `execute_blender_code`, exported to
`assets/models/shooting-range.glb` (113 KB) + `shooting-range.blend` source.
Flat/unshaded: every material is an Emission shader + pure-white world, so the pack
renders with zero lighting cost in Three.js.
- Hierarchy: Floor / Walls / LaneLines / Barrier / Target_1..5 / RangeCamera. 5 meshes,
  11 materials, 4708 verts, 2714 tris, 32 draw calls. Camera at (0, 6.4, 1.65), 40mm, +Y.
- Floor grid crosses (+) are real geometry: 66 recessed dark boxes per tile, not a texture.
- Targets: one shared mesh data block, origin at the base pivot. Bullseye is 4 concentric
  annulus rings (red/white/red/white-centre) built as quads, not decals, +0.015 in front
  of the plate so it never z-fights. All materials `use_backface_culling=False`.
- Fall: one `TargetFall_N` action per target, rotation_euler X 0→0 (f1-20) → +90° (f44),
  BEZIER/EASE_OUT. Verified in Blender render (targets land face-down, back up) and in
  the exported GLB (node Target_3 up-vector [0,0,1] → [0,-1,0], animation drives the
  correct node). Duration 1.83 s each, 1 track.
- Blender 5.2 API gotchas hit here: `bmesh.faces.new(verts[, source])` takes NO material
  arg — set `face.material_index` after; objects are made via `bpy.data.objects.new()`
  + `scene.collection.objects.link()` (no `collection.objects.new`); `Material.shadow_method`
  and `export_colors` on glTF export do not exist. A `bpy.ops.render.render()` MCP call
  times out with "No data received" but the render still lands on disk — poll the file.
- Blender closed once mid-session; relaunch with
  `blender.exe --python <autostart that calls bpy.ops.blendermcp.start_server()>`.
  A .py passed as a positional arg is refused as an unsupported file format.
- Verification: new `tests/load_range_glb.mjs` (needs `--loader tests/three-shim.mjs`,
  which maps `three`/`three/addons/` onto the vendored r149 build) loads the GLB and
  asserts the fall tips the target. `npm test` still 58/58 green.

## Second overhaul (2026-09-21) — DONE, pushed f451639, SW v14
- Viewmodel is the weapon alone: hand roots and the FPS arm rig binding deleted
  from game.js. `inspection.js` and `tests/inspection.cjs` deleted; the KeyF bind,
  all `inspect*` state, the loadout inspect feature/button/script tag/precache
  entry are gone. `#loadoutInspect` stays `hidden` in index.html.
- Weapon parts re-separated in Blender (`tests/separate2.py`, deleted after use):
  the take-1 `attachment` pivot over-captured whole-model geometry on
  Mosin/AKM, which was the floating mags/rounds. Take 2 classifies by strict
  name regex. `fitWeapon` was also broken — it applied an orientation Euler then
  overwrote it, so fitted Z extent was ~0.03–0.08 m (weapons rendered as slivers);
  now axis-guess orientation + real-world length scaling + muzzle anchor from
  the fitted box.
- CRITICAL: the separation renames pivots to `mag_Object_19` etc. The old
  `NAME_HINTS = { mag: /^mag$/ }` no longer matched, so `root.userData.mag` was
  undefined and reload crashed with "Cannot read properties of undefined
  (reading 'copy')" (861 page errors). Hints now match by prefix (`/^mag/`) and
  `relinkParts` picks the heaviest pivot, same as fitWeapon.
- CRITICAL: game.js module-level `C` is the bare `window.POLY_CORE` facade — it
  has `forMap` but NO `.MAP`. `loadMap()` reassigns `C = POLY_CORE.forMap(id)`.
  Any `C.MAP.*` read in game.js is always undefined; gate camera/training
  behaviour on `mapId` or `match.training` instead.
- Pro FPS bots: `CLIP_FILES` registers the full Pro Rifle Pack (33 clips), each
  verified to parse with a real AnimationClip by `tests/probe_clips.mjs`
  (`node --import ./tests/three-importmap.mjs tests/probe_clips.mjs`).
  Two legacy Mixamo files (`male_laying_pose.fbx`, `running_slide.fbx`) only
  load with a `window` shim and were replaced by pack clips `death from the
  back.fbx` / `jump down.fbx`. Range spawn pads play idleAim/run/walkRight/
  slide/crouchAim/lay so the whole suite is visible at once; live run shows all
  6 bots armed with advancing clip times.
- Top-down camera: `KeyT` toggles an overhead view on any non-default map
  (`mapId!=='desert'`). Applies position + downward pitch + eased fov, exposed
  as `topDown` in `Game.state()`. Live verified: cam moves to [0,34,34] and
  toggles back off.
- Training: the `if(C.MAP.training&&primaries.includes('mosin'))primary='mosin'`
  lock in `deploy()` is removed; primary/secondary/melee switch freely via
  Digit1/2/3 and wheel. Inventory is `[primary,'deagle','bayonet']`.
- Audio: per-weapon firing PROFILES added — `sound()` previously only knew
  ak47/awp/kar98/deagle, so akm/l96/mosin/hecate/mx/bayonet fired silently.
  First Blood is once per match via a `firstBlood` flag (reset in `spawn()`)
  plus an `announce()` guard so `'streak'` can never resolve to `list[0]`.
  Killstreak caps are now per pack: `TIER_CAPS = { male: 14, female: 9 }` in
  audio.js. The male pack walks all 14 tiers (11 Mortal Kombat clips + First
  Blood + Mega + the two TTS-generated `[audio]Monster-Kill !` and
  `[audio]Godlike!`), the female pack 9 (8 UT clips + the TTS
  `[UT Sexy Female Announcer]Monster-Kill!`). `addKill()` in game.js no longer
  gates the streak itself — `announce()` applies the active pack's cap.
- Sniper bolt strokes along the bore axis with a sin(π·t) pull/return instead
  of the outward-popping rotation on the wrong axis.
- sw.js: `assets.js` was MISSING from the precache list (it is load-bearing —
  CLIP_FILES/fitWeapon/bindPart live there) and is now included; cache v14.
  The FILES list now matches index.html's script tags exactly.
- `npm test` is 70/70 green (`tests/overhaul.cjs` added: 12 tests for clip
  registration, training freedom, First Blood, top-down, no-hands viewmodel).
  Live browser run: 0 console/page errors, 6 animating bots, top-down verified.
- Headless Playwright note: `?test=1` still hits the old SW cache because the
  fetch handler uses `ignoreSearch:true` — unregister the service worker in an
  `add_init_script` before first navigation. `deploy()` calls
  `document.activeElement?.blur()`, which dispatches a window blur and pauses
  the match via the `blur→pause()` listener, so synthetic keydown events never
  reach the handler; click the canvas first, then use `pg.keyboard.press`.


## 2026-09-21 — critical fixes round (assets, loadout, ADS, maps, audio)

- Weapons: the fragmented GLBs from the separation pass were replaced with the
  clean base models from `My Game/Guns`. `assets.js` only hides loose rounds and
  spare empty mags now (`assembleParts`), `pickMag` picks the loaded mag by mesh
  count, and the Mosin's internal mag is kept (`INTERNAL_MAG`). No vertex
  re-seating. `npm test` 75/75.
- Loadout: `loadoutInspectTime` was never declared (page error on every weapon
  click) and `tickLoadoutPreview` had an orphaned `else if`; both fixed. MX Knife
  had no card, so it was unreachable — the secondary list is now
  `['deagle','bayonet','mx']`. "AK-47" text tags removed from index.html (HUD
  name, slot label, loadout preview); the weapon is an AKM.
- ADS: the anchor is placed on the weapon's fitted centre-line at the scope
  glass height (`assets.js`), and `animateWeapon` reads the anchor via
  `getWorldPosition` relative to the viewmodel's own world position, then moves
  the viewmodel so the anchor lands on the camera axis. Verified live: all 5
  ADS weapons reach 0.000 lateral offset. Scoped-optic pivots are matched by
  brand (`hawke_endurance__9` on the L96, `sb_5-25x56_scope_17` on the Hecate),
  not just `/scope/`.
- Maps: the `116791` code-entry feature is fully removed. Deleted test maps
  `range`/`depot` from maps.js, `MAP_MODELS` emptied, `map-depot.glb`,
  `theking1322_range.glb`, `map-depot.blend` and `tests/verify_116791.py`,
  `tests/load_map_depot.mjs`, `tests/load_range_glb.mjs`,
  `tests/map_depot_check.py` deleted, map-code HTML + test-map CSS stripped.
  The rotation is `desert, industrial, urban, training` only.
- Reload bug fixed: the timer was decremented twice (once in the `running`
  branch, once after), so every reload completed at double speed.
- sw.js cache bumped v17 → v18.

## 2026-09-24 — critical visual/asset fixes round — DONE, pushed 41f232a, SW v20

All 8 reported items closed and live-verified in headless Edge against the dev
server; `node --test` over the six-file suite is 85/85.

1. Hecate orientation: fitWeapon now derives the muzzle direction from the
   named muzzle/stock pivots at load time instead of trusting a per-file flip
   table, and a post-rotation self-check flips any gun whose measured muzzle
   lands at +z (behind the camera). Hecate and MX measure +X in asset space,
   so all entries now carry flip:1; the old overhaul.cjs assertion that
   encoded the stale "-X" measurement was corrected.
2. L96 invisible: two causes. (a) its loaded mag pivot `762x51_mag_1` was
   matched by LOOSE_ROUND's `762\d*_*\d*$` alternative and hidden — pickMag no
   longer selects by mesh count or rejects empty-named mags. (b) placement
   mixed frames: a post-rotation box offset was written onto the pre-rotation
   pivot, leaving whole guns behind the camera. Placement is now normalised in
   world space on root (rear at z=0, barrel to -z).
3. Bot scale: soldierRig and the clipRig fallback normalise to the 1.7 m
   player eye height. Live: all 5 bots measure exactly 1.7 m. Head-shot zone
   and trainer aim pitch rescaled for the new rig.
4. AKM/L96 magazine: pickMag rewrite keeps the loaded mag picked and visible
   on both; the spare empty mag stays hidden.
5. ADS: weapon lowered 0.14 at hip; ADS depth pulls to z=-0.55 so the rear
   sight meets the eye instead of stopping mid-barrel.
6. Knife: procedural Butterfly builder removed from visuals.js; only MX Knife
   (scaled to 0.42 m) and Bayonet remain. HUD slot reads "3 KNIFE", inspect
   hint updated, zero butterfly strings in the shipped DOM/JS. The two dead
   butterfly tests were replaced by a purge assertion.
7. Announcer: verified already correct — Monster Kill/Godlike sit at kills
   13/14 in the male pack. No change.
8. Polish: fit diagnostics removed; stray probe scripts in tests/ and
   backrooms-3am deleted. backup_v1/ kept as the pre-swap rollback path.

Live measurements (headless Edge): all 7 weapons finite, visible, muzzle ahead
of the camera (akm -0.74, l96 -1.64, mosin -0.74, mx -0.24, hecate -0.78,
deagle -0.16, bayonet -0.15). Player eye 1.7 m, bots 1.7 m x5.

Note for next session: the service worker caches aggressively. When
live-probing after an edit, unregister the SW from inside the page origin and
reload, or bump CACHE in sw.js, or the probe silently measures the old bundle.

## 2026-09-24 — viewmodel framing, strict roster, modes — DONE, pushed 175c71a, SW v27

All four reported items closed and live-verified in headless Edge.

1. Viewmodel positioning. The "too low" symptom had three stacked causes, not
   the two originally suspected:
   - game.js animateWeapon() ran m.scale.set(1,1,1) every frame, destroying the
     fit scale the AKM needs (0.10063x on its 8.94-unit export). The L96 looked
     fine only because its fit scale is ~1.
   - cloneGLB cloned only the inner scene, discarding the fit's root-space
     recentring on every clone.
   - fitWeapon applied world-space offsets to local child positions; divided by
     root.scale they under-travelled, so the gun's rear never landed at z=0.
   Fixed all three, then replaced the fixed-metre hip offset with
   frustum-derived placement: measure each weapon's own box, solve depth so the
   vertical span fits in 85% of the half-height at the near face, anchor the top
   5% below the crosshair. Live: akm/l96/hecate/deagle all on screen, ndcY
   bottom >= -0.635, right edge at +0.26, nothing clipped.
2. Strict roster: AKM, L96 (AWP), PGM Hecate II + Deagle sidearm only. Mosin,
   MX Knife and Bayonet gone from core/assets/game/HUD/manual/tests. Melee slot
   removed from inventory; the six slot==='melee' guards now go through
   isFirearm(). AKM ADS removed: ads:false, spreadScoped==spreadBase, right-click
   no longer enters ADS, pickSpread only honours scoped when w.ads is true.
3. Bots: already 1.7 m x5 from the previous round; re-verified unchanged.
4. Modes: MODES = skirmish (buy, first to 5), ffa (120s kill race, no buy,
   player + bots respawn), search (no clock, one life, no respawn). Menu has a
   #modeSelect dropdown with a description line. THE CRITICAL BUG: forMap()'s
   per-map createMatch closed over the map and took one mode arg, but game.js
   calls createMatch(C.MAP, modeKey) - the map object became the mode key,
   MODES[mapObject] fell back to skirmish, and every match silently ran as
   skirmish. Fixed by taking the last string argument. Verified live: all three
   modes start in the right phase with the right objective text; search ends on
   player death (end), ffa respawns and continues.

Tests 91/91 (was 85; +6 mode tests). Probes deleted. backup_v1/ kept.
