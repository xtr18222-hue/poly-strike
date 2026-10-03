# POLY STRIKE — third-party UI icon assets

The SVG icons in this directory (`assets/icons/`) are **Counter-Strike UI icons**
extracted from the game by the community archive:

  Source repository : https://github.com/Juknum/counter-strike-icons
  Asset subdirectory : `csgo/materials/panorama/images/`

## Ownership and licence

Counter-Strike, Counter-Strike: Global Offensive and all related names, marks,
artwork and icons are **the property of Valve Corporation**.

The source repository states (see its `LICENSE`):

  "All Counter-Strike icon assets included in this repository are the property
   of Valve Corporation. These assets are extracted from Counter-Strike and
   are used here for informational and community purposes only."

  - Counter-Strike(R) is a registered trademark of Valve Corporation.
  - These icons are **not licensed for commercial use** without explicit
    permission from Valve Corporation.
  - Use of these assets must comply with Valve's legal terms
    (https://store.steampowered.com/subscriber_agreement/).

## Status in this project

- These icons are NOT original POLY STRIKE artwork. POLY STRIKE is an
  independent browser FPS and is not affiliated with, endorsed by, or
  sponsored by Valve Corporation.
- The icons are bundled locally (in this directory) so the game never makes a
  runtime request to any external repository. POLY STRIKE does not depend on
  the source repository at runtime.
- They are used for the HUD's competitive-FPS visual presentation only
  (weapon selector, kill feed, health/armor readout, equipment icons).
- If Valve or a Valve representative requests removal of these assets,
  remove this directory and the `assets/icons` references in
  `assets/icons.js`, `index.html` and `style.css`.

## Icons in use

POLY STRIKE weapon → CS:GO icon (silhouette, white fill):

| POLY STRIKE weapon | CS:GO icon file        | Source relative path                        |
|--------------------|------------------------|---------------------------------------------|
| AKM                | `ak47.svg`             | `icons/equipment/ak47.svg`                  |
| L96 A1             | `awp.svg`              | `icons/equipment/awp.svg`                   |
| PGM Hecate II      | `g3sg1.svg`            | `icons/equipment/g3sg1.svg`                 |
| Mossberg 590A1     | `nova.svg`             | `icons/equipment/nova.svg`                  |
| Desert Eagle       | `deagle.svg`           | `icons/equipment/deagle.svg`                |
| Glock-19           | `glock.svg`            | `icons/equipment/glock.svg`                 |
| FA-03 Bayonet      | `knife_t.svg`          | `icons/equipment/knife_t.svg`               |
| M67 Grenade        | `hegrenade.svg`        | `icons/equipment/hegrenade.svg`             |
| Flashbang          | `flashbang.svg`        | `icons/equipment/flashbang.svg`             |

HUD icons:

| HUD element         | CS:GO icon file      | Source relative path                       |
|---------------------|----------------------|--------------------------------------------|
| Health              | `health.svg`         | `icons/ui/health.svg`                      |
| Armor / helmet      | `armor.svg`          | `icons/equipment/armor.svg`                |
| Kevlar              | `kevlar.svg`         | `icons/equipment/kevlar.svg`               |
| Helmet              | `helmet.svg`         | `icons/equipment/helmet.svg`               |
| Headshot (kill feed)| `icon_headshot.svg`  | `hud/deathnotice/icon_headshot.svg`        |
| Penetration kill    | `penetrate.svg`      | `hud/deathnotice/penetrate.svg`            |
| Blind kill          | `blind_kill.svg`     | `hud/deathnotice/blind_kill.svg`           |
| No-scope kill       | `noscope.svg`        | `hud/deathnotice/noscope.svg`              |
| Suicide / death     | `icon_suicide.svg`   | `hud/deathnotice/icon_suicide.svg`         |
| Revenge             | `revenge.svg`        | `hud/deathnotice/revenge.svg`              |
| Domination          | `domination.svg`     | `hud/deathnotice/domination.svg`           |
| Smoke kill          | `smoke_kill.svg`     | `hud/deathnotice/smoke_kill.svg`           |
| Bullet (ammo)       | `bullet.svg`         | `icons/ui/bullet.svg`                      |
| Shell (shotgun)     | `bullet_shell.svg`   | `icons/ui/bullet_shell.svg`                |
| Out of ammo         | `outofammo.svg`      | `icons/ui/outofammo.svg`                   |

## Copied, not linked

Every file listed above is a byte-identical local copy of the corresponding
file in the source repository's `csgo/` tree. No icon was re-drawn, recoloured,
re-traced or substituted. The CS:GO icons are single-path white silhouettes;
the HUD tints them with CSS `color` + `mask-image` so they blend with the
POLY STRIKE palette without altering the source geometry.
