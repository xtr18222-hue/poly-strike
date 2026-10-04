/* ============================================================================
 * POLY-STRIKE UI icon registry (CS2 panorama glyphs).
 *
 * Loads the bundled Counter-Strike 2 interface icons (assets/cs2/*.svg) ONCE,
 * converts each to a reusable DOM node and caches it. The HUD, the kill feed,
 * the weapon stack and the menu chrome all reuse those nodes: there is no
 * per-frame SVG parsing and no network fetch at runtime.
 *
 * SOURCE: Juknum/counter-strike-icons, cs2/panorama/images/icons/.
 * These glyphs are the property of Valve Corporation, used here for
 * community/informational purposes. They are NOT POLY STRIKE artwork; see
 * assets/cs2/ATTRIBUTION.md. POLY STRIKE is not affiliated with Valve.
 * ========================================================================= */

/* global window, document, fetch */

var PS_ICONS = (function () {
  'use strict';

  // POLY STRIKE weapon key -> CS2 panorama equipment file. The icon is a HUD
  // glyph only: the weapon's own name, 3D model and stats are untouched. Every
  // entry resolves to a bundled local file.
  var WEAPON_ICON = {
    akm: 'ak47',
    l96: 'awp',
    hecate: 'g3sg1',
    mossberg: 'nova',
    deagle: 'deagle',
    glock: 'glock',
    knife: 'knife',
    knife_tactical: 'knife_tactical',
    grenade: 'hegrenade',
    flash: 'flashbang'
  };

  // Non-weapon HUD glyphs, all from the same CS2 panorama set.
  var HUD_ICON = {
    headshot: 'kill_headshot',
    health: 'health',
    armor: 'armor',
    helmet: 'helmet',
    kevlar: 'kevlar',
    bullet: 'bullet'
  };

  // Menu chrome (the top navigation and the icon rail), from ui/.
  var UI_ICON = {
    home: 'home',
    news: 'news',
    settings: 'settings',
    power: 'power',
    play: 'play',
    loadout: 'loadout',
    inventory: 'inventory',
    bot: 'bot',
    back: 'back',
    close: 'cancel',
    pause: 'pause',
    resume: 'resumegame',
    online: 'online',
    timer: 'timer',
    muted: 'muted',
    unmuted: 'unmuted',
    warning: 'warning',
    crosshair: 'crosshair'
  };

  var ICON_DIR = 'assets/cs2/';
  var cache = {};        // file name -> Promise<SVGElement|null>
  var isSettled = {};    // file name -> true once the fetch has a value
  var cachedValue = {};  // file name -> the settled SVGElement|null

  function fileFor(name) {
    if (WEAPON_ICON[name]) return WEAPON_ICON[name];
    if (HUD_ICON[name]) return HUD_ICON[name];
    if (UI_ICON[name]) return UI_ICON[name];
    // Callers may pass the CS2 panorama file name directly.
    return /^[a-z0-9_]+$/i.test(name) ? name : null;
  }

  function allNames() {
    var out = [];
    [WEAPON_ICON, HUD_ICON, UI_ICON].forEach(function (table) {
      Object.keys(table).forEach(function (k) { out.push(table[k]); });
    });
    return out;
  }

  // Fetch once, parse once. Repeat callers get the same promise. A missing or
  // malformed icon resolves to null so a HUD element simply stays empty
  // instead of throwing and killing the frame.
  function load(file) {
    if (cache[file] !== undefined) return cache[file];
    var p = fetch(ICON_DIR + file + '.svg')
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (text) {
        if (!text) { isSettled[file] = true; cachedValue[file] = null; return null; }
        var host = document.createElement('div');
        host.innerHTML = text;
        var svg = host.querySelector('svg');
        if (!svg) { isSettled[file] = true; cachedValue[file] = null; return null; }
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        isSettled[file] = true; cachedValue[file] = svg;
        return svg;
      })
      .catch(function () { isSettled[file] = true; cachedValue[file] = null; return null; });
    cache[file] = p;
    return p;
  }

  function preload() { return Promise.all(allNames().map(function (f) { return load(f); })); }

  // Clone the cached SVG at a fixed pixel height; width follows the glyph's
  // own aspect ratio. CSS sizes/tints the result (.ps-icon).
  function cloneAt(svg, px) {
    var n = svg.cloneNode(true);
    var vb = n.viewBox && n.viewBox.baseVal;
    var w = vb && vb.width ? vb.width : 24;
    var h = vb && vb.height ? vb.height : 24;
    n.style.height = px + 'px';
    n.style.width = (px * w / h) + 'px';
    n.classList.add('ps-icon');
    return n;
  }

  // Public: nodeFor(name, px) -> Element|Promise<Element|null>|null
  // name is a POLY STRIKE weapon key, a HUD/UI glyph key, or a CS2 file name.
  // Returns a NODE (not a promise) whenever the SVG has already loaded, so the
  // HUD can paint it in the same frame it asks. The HUD reuses row elements
  // across kills and clears them on every signature change; a promise-only API
  // loses the icon to that clear before it ever resolves.
  function nodeFor(name, px) {
    var file = fileFor(name);
    if (!file) return null;
    if (isSettled[file]) {
      var svg = cachedValue[file];
      return svg ? cloneAt(svg, px) : null;
    }
    return load(file).then(function (svg) { return svg ? cloneAt(svg, px) : null; });
  }

  return {
    WEAPON_ICON: WEAPON_ICON,
    HUD_ICON: HUD_ICON,
    UI_ICON: UI_ICON,
    preload: preload,
    nodeFor: nodeFor,
    fileFor: fileFor,
    allNames: allNames,
    weaponFile: function (k) { return WEAPON_ICON[k] || null; },
    hudFile: function (n) { return HUD_ICON[n] || null; },
    uiFile: function (n) { return UI_ICON[n] || null; }
  };
})();
