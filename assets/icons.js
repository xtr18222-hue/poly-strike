/* ============================================================================
 * POLY-STRIKE UI icon registry.
 *
 * Loads the bundled CS:GO UI icons (assets/icons/*.svg) ONCE, converts each to
 * a reusable DOM node, and caches the result. The HUD, kill feed and weapon
 * selector reuse the same nodes: there is no per-frame SVG parsing and no
 * network fetch at runtime.
 *
 * LICENCE: the Counter-Strike icons are the property of Valve Corporation and
 * are used here for community/informational purposes. They are NOT POLY STRIKE
 * artwork; see assets/icons/ATTRIBUTION.md. POLY STRIKE is not affiliated with
 * Valve Corporation.
 * ========================================================================= */

/* global window, document, fetch */

var PS_ICONS = (function () {
  'use strict';

  // POLY STRIKE weapon key -> CS:GO icon file (silhouette). Every entry is a
  // bundled local file (assets/icons/*.svg). The icon is a HUD glyph only: the
  // weapon's own name, 3D model and stats are untouched.
  var WEAPON_ICON = {
    akm: 'ak47',
    l96: 'awp',
    hecate: 'g3sg1',
    mossberg: 'nova',
    deagle: 'deagle',
    glock: 'glock',
    knife: 'knife',
    grenade: 'hegrenade',
    flash: 'flashbang'
  };

  // Non-weapon HUD glyphs bundled from the same pack.
  var HUD_ICON = {
    headshot: 'icon_headshot',
    health: 'health',
    armor: 'kevlar',
    helmet: 'helmet',
    bullet: 'bullet'
  };

  var ICON_DIR = 'assets/icons/';
  var cache = {};   // file name -> Promise<SVGElement|null>
  var isSettled = {};   // file name -> true once the fetch has a value
  var cachedValue = {}; // file name -> the settled SVGElement|null

  function fileFor(name) {
    if (WEAPON_ICON[name]) return WEAPON_ICON[name];
    if (HUD_ICON[name]) return HUD_ICON[name];
    // Callers may pass the CS:GO file name directly.
    return /^[a-z0-9_]+$/i.test(name) ? name : null;
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

  function preload() {
    var all = [];
    Object.keys(WEAPON_ICON).forEach(function (k) { all.push(load(WEAPON_ICON[k])); });
    Object.keys(HUD_ICON).forEach(function (k) { all.push(load(HUD_ICON[k])); });
    return Promise.all(all);
  }

  // Clone the cached SVG at a fixed pixel height, width follows the glyph's
  // aspect ratio. CSS sizes/tints the result (.ps-icon).
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
  // name is a POLY STRIKE weapon key, a HUD glyph key, or a CS:GO file name.
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
    preload: preload,
    nodeFor: nodeFor,
    weaponFile: function (k) { return WEAPON_ICON[k] || null; },
    hudFile: function (n) { return HUD_ICON[n] || null; }
  };
})();
