# CS2 Panorama Icons — attribution

The SVG glyphs in this directory (`assets/cs2/*.svg`) are taken verbatim from
the `cs2/panorama/images/icons/` tree of **Juknum/counter-strike-icons**
(https://github.com/Juknum/counter-strike-icons), a community archive of
Counter-Strike interface artwork.

## Ownership

Counter-Strike, Counter-Strike 2 and all associated artwork, logos, silhouettes
and interface icons are the property of **Valve Corporation**. They are bundled
here for community, informational and educational use only.

**POLY STRIKE is not affiliated with, endorsed by or sponsored by Valve
Corporation.** These glyphs are not original POLY STRIKE artwork and POLY STRIKE
makes no claim to them.

## What was changed

Only what was required to render the glyphs as monochrome UI icons:

- Paint attributes (`fill`/`stroke`) that used greyscale or brand colours were
  normalised to `#FFFFFF` so the icons can be tinted with CSS `color`.
- `fill-opacity` / `stroke-opacity` presentation attributes were removed.
- Nothing else: no paths were edited, no glyphs were redrawn, no artwork was
  substituted or generated.

Glyphs that exist in the archive as empty stubs (`world.svg`, `worldent.svg`,
`trigger_hurt.svg`) were not copied.

## Maps (Panorama -> CS2 panorama names)

- Weapons: `ak47`, `awp`, `deagle`, `glock`, `knife` / `knife_tactical` …
- Equipment: `kevlar`, `armor_helmet`, `helmet`, `hegrenade`, `flashbang` …
- UI chrome: `home`, `news`, `settings`, `power`, `play`, `loadout`,
  `inventory`, `health`, `armor`, `crosshair`, `kill_headshot`, `timer` …

The previous `assets/icons/` set held the same repo's **CS:GO** glyphs. It is
kept in place so existing references keep resolving during the CS2 transition.
