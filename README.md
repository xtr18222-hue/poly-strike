# POLY-STRIKE / Field Operations

Original low-poly tactical FPS in vanilla JavaScript, Three.js and Web Audio. Not affiliated with Valve; no Counter-Strike assets included.

Play: https://xtr18222-hue.github.io/poly-strike/

## Modes and maps

Main menu order: Play Offline (vs Bots), Play Online, Settings.
Select Sandline (Desert Compound), Ironworks (Industrial Warehouse), or Crossfire (Urban Alleyways) before starting. Each has distinct collision geometry and routes.

Offline: eliminate five bots in 90 seconds. Death/timeout loses the round. Five-second preparation; first to five wins. Health, armor and ammunition reset. All four weapons unlocked. No bomb or buy menu.

Online: host selects a map, clicks Play Online → Create Room, then shares the displayed code with one friend. Friend clicks Play Online, enters code and Join Room. Both click Resume when connected. First to five eliminations wins; timeout awards the round to higher HP, equal HP draws. Host calculates damage, ammo, movement bounds and rounds; guest receives snapshots at 20Hz. Online matches do NOT pause in menus. Leave returns to the main menu; disconnection ends the session. No host migration or ranked anti-cheat.

Internet is required for online play. Vendored PeerJS uses its public signaling service plus WebRTC/STUN; no custom backend is required. Availability is not guaranteed. Restrictive NAT/firewalls may require TURN, which is not bundled. Try another network if a room times out. Room codes are not authentication; share privately. WebRTC exposes peer IP addresses to the other player. No accounts or analytics.

## Polish update

Custom usernames (20 characters) persist locally and appear for both online players. Made by XTR is shown on the menu. Tab displays Name / Kills / Deaths / Score; score is 100 per kill plus 250 per round won. Bot stats persist within the match. Radar shows all living opponents. Headshots ring a metallic ding; headshot and knife eliminations appear amber. Red directional arcs point toward the attacker.

F performs eased airborne AK/Deagle inspections, a slower top-to-bottom AWP sweep, or one of two butterfly flips. Deagle deals 53 body damage with no distance falloff: two body hits or one headshot kill a full-health bot/online opponent. Leg hits retain their reduced multiplier. Natural finishes and existing ADS remain.

## Controls

- WASD: move; Shift: sprint
- C or Ctrl: crouch; press while sprinting forward to slide
- Space: jump
- Mouse: aim; left click: shoot/slash
- Right click: AK-47/Deagle ADS toggle, AWP scope toggle
- 1: AK-47; 2: AWP; 3: Desert Eagle; 4: Butterfly Knife
- Q: previous weapon; mouse wheel: cycle
- R: reload (offline weapon switch cancels; online switching waits for reload)
- F: inspect; knife alternates exactly two smooth flip variants
- Tab: hold scoreboard; Escape: operator menu/release mouse
- M: mute; sensitivity in Settings

Desktop keyboard/mouse and WebGL required. Click to capture mouse/audio. Drag-to-look fallback holds right mouse; right-click also toggles ADS, so pointer lock is recommended.

AK-47: automatic 30/90, deterministic climbing/sideways spray, classic wood/black steel finish. AWP: 10/30, olive finish, high damage, bolt delay, modeled scope and custom reticle/lens overlay; firing exits scope. Deagle: semi-auto 7/35, silver metal; click once per shot. Butterfly: close-range unlimited slashes, chrome blade/cool handles.

## Graphics and offline use

High / Medium / Performance Mode settings persist locally. Performance caps framebuffer to 307,200 pixels, disables decorative effects/textures, uses lightweight world materials and merged static geometry. No post-processing or shadow maps in any mode. HUD updates are budgeted separately. Geometry/textures are disposed when switching maps/presets.

Target: near 60FPS on low-end hardware. No universal 60FPS or 1GB-RAM guarantee: browser/OS/GPU consume memory too. Measurements from this development machine are not a 1GB-device certification.

Open `index.html` directly offline, or serve with `python -m http.server 18957 --bind 127.0.0.1`. GitHub Pages caches all local runtime assets for offline repeat visits. Online mode still needs internet. After an update, reload once more if the old menu remains while the new service worker activates.

## Development and QA

- `node --test tests/*.cjs` — core, three-map navigation traces, visuals, render budgets, networking validation, host-authoritative duel
- `uv run --with playwright python tests/gameplay.py` — original gameplay regression
- `uv run --with playwright python tests/upgrade.py` — menu/maps/settings, ADS, slide, two inspections, AK reliability
- `uv run --with playwright python tests/online_game.py` — two real browser pages/public signaling, bidirectional damage, movement, results/disconnect
- `uv run --with playwright python tests/network.py` — real PeerJS transport
- `uv run --with playwright python tests/offline.py` — offline cache, direct file, pointer lock
- `uv run --with playwright python tests/performance.py` — 5-second per-map frame sampling, p95 and renderer budgets

Browser tests use installed Edge. Set TEST_URL to a root URL ending `/` for hosted verification. `?test=1` enables local test fixtures; normal URLs expose read-only state. Performance artifacts are ignored by git.

Architecture: maps.js static arenas; core.js DOM-free context-bound bot simulation; visuals.js procedural factories/batching; game.js controller/render/UI; settings.js explicit budgets; net.js PeerJS lifecycle; duel.js host simulation; online.js adapter; audio.js synthesized sounds. Three.js r149 and PeerJS 1.5.5 are vendored with MIT licenses. No runtime CDN dependency.

Bump sw.js cache name on runtime changes. Maintain MEMORY.md without secrets.
