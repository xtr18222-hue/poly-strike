# POLY-STRIKE / Sandline

An original, single-player low-poly tactical FPS built with vanilla JavaScript, Three.js and Web Audio. Not affiliated with Valve; no Counter-Strike assets are included.

## Play

Open `index.html` directly in a desktop browser, or serve this directory with `python -m http.server 18957` and visit http://localhost:18957/. All runtime assets are local. GitHub Pages supports offline repeat visits after the service worker finishes caching. Direct file opening also works without internet.

Desktop mouse and keyboard required. Use a current Chrome, Edge or Firefox with WebGL/hardware acceleration enabled. Click DEPLOY to capture your mouse and enable audio. If capture is unavailable, use the drag-look checkbox; hold right mouse to look around.

## Objective

Eliminate all five bots within 90 seconds. Dying or running out of time loses the round. First to five round wins takes the match. A five-second preparation period precedes each round. Health, armor, magazines and reserves reset each round. All four weapons are available immediately. There is no bomb objective, multiplayer or buy menu.

## Controls

- WASD: move
- Mouse: aim (right-button drag in fallback mode)
- Left mouse: shoot / knife slash
- Right mouse: AWP scope toggle
- 1: AK-47
- 2: AWP
- 3: Desert Eagle
- 4: Butterfly Knife
- Q: previous weapon; mouse wheel: cycle
- R: reload (switching weapons cancels reload)
- F: inspect, including butterfly handle flips
- Space: jump
- Shift: slow walk
- C or Ctrl: crouch
- Hold Tab: scoreboard
- Escape: pause and release mouse
- M: mute/unmute

Sensitivity can be adjusted on the title screen. Losing focus or changing tabs pauses the match.

## Arsenal

AK-47: 30/90 ammo, full automatic, deterministic climbing/sideways spray and movement-dependent spread. Fire short bursts or pull down to control recoil.

AWP: 10/30 ammo, high body damage, bolt-action delay, modeled scope plus custom lens/reticle overlay and zoom. Stand still and scope for precision; unscoped spread is intentionally high. Shooting exits scope.

Desert Eagle: 7/35 ammo, high-impact semi-automatic. Each click fires once; allow recoil to settle. Headshots multiply damage.

Butterfly Knife: unlimited close-range slashes, animated equip/inspect flips with independent handle pivots. Knife movement is fastest. It cannot reach distant enemies.

HUD: radar upper-left, score/timer top-center, kill feed upper-right, health/armor bottom-left, ammo and weapon slots bottom-right. Radar shows enemies with line of sight, not all enemies through walls.

## Development and QA

- Core rules: `node --test tests/core.test.cjs`
- Procedural models: `node --test tests/visuals.cjs`
- Local HTTP server: `python -m http.server 18957 --bind 127.0.0.1`
- Browser checks: `uv run --with playwright python tests/gameplay.py`
- Offline/file/pointer lock: `uv run --with playwright python tests/offline.py`
- Set TEST_URL to a deployed root URL ending in `/` to test hosted code.

The browser tests use installed Microsoft Edge. `?test=1` explicitly enables placement/round fixtures; normal URLs expose only read-only state. Interactions are exercised with actual keyboard/mouse events. No accounts, analytics, remote APIs, credentials or external image requests.

`core.js` is a DOM-free UMD simulation. `visuals.js` builds procedural meshes. `game.js` owns rendering/input/raycasting and the HUD. `audio.js` synthesizes sound. Three.js r149 is vendored under `vendor/`; its MIT license is included. All artwork is generated from primitives and canvas. User-provided reference images were not imported; their exact visual appearance could not be verified.

Bump the cache name in `sw.js` whenever a runtime file changes. Maintain root `MEMORY.md` with current verified progress and blockers, without secrets.
