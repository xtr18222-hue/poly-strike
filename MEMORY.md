# POLY-STRIKE project memory

Original offline-capable Three.js tactical FPS, not affiliated with Valve.
Location: C:/Users/xtr18/Projects/poly-strike.
Target: new public xtr18222-hue/poly-strike repo, main/root GitHub Pages.
Read this file before resuming; update verified changes and blockers. Never store secrets.

## Decisions
- Vendored Three.js r149 classic script for file:// and no CDN runtime dependency.
- Exactly AK-47, AWP, Desert Eagle, Butterfly Knife. All available each round; no economy gating in the UI.
- Five enemy bots; first to five rounds; 90-second elimination rounds. Procedural map, models and Web Audio.
- Deterministic UMD core, separate renderer/controller; tests with Node and Playwright Edge.
- Mouse/keyboard desktop-first. Pointer lock and a fallback drag-look mode.

## Progress
- Toolchain verified: Node v24, Python 3.11, uv, portable gh authenticated.
- Core and procedural visual tests: 36 passing, including 30 seeded bot traces. Edge gameplay covers movement/collision, jump/crouch, all four weapons, reload, scope/raycast, knife flips/hits, pause, scoreboard and win/loss/restart. Zero observed page errors.
- Offline service-worker reload, direct file:// launch and actual pointer lock passed.
- Actual framebuffer color variation verified; 10-second render sample measured 59.7 FPS on this machine; natural bot pathfinding and attacks verified.
- Red/black geometric weapon finishes implemented. User image references could not be visually analyzed; no exact-match claim.
- Independent precommit review pending. Deployment not yet created.
