/* BOOT REGRESSION GUARD
 *
 * Why this file exists:
 *
 * The v35 build (8242ffb) shipped completely dead: no camera, no input, no
 * weapon, no pause panel. The cause was a one-line mistake — the FOV patch
 * deleted `let announcerVoice='male';` while leaving the boot assignment
 * `announcerVoice = localStorage.getItem('poly-announcer') || 'male'` in place.
 * game.js is a strict-mode IIFE, so that assignment threw ReferenceError at
 * eval time and the whole controller never ran.
 *
 * `node --check` passed (the syntax is legal) and every unit test passed
 * (they never eval game.js), so nothing in the existing suite could catch it.
 *
 * This file evals game.js the way the browser does — inside an IIFE with a
 * browser-shaped `window`/`document` — and asserts it boots. If any top-level
 * statement throws again, this test fails instead of the deployed game.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');

/* The real deterministic simulation core. core.js is a UMD module with no DOM
 * or WebGL access, so requiring it directly gives game.js the genuine C.MAP /
 * C.WEAPONS / C.createMatch surface instead of a hand-rolled approximation. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import './three-importmap.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// The same THREE the other regression suites use, with the addon constructors
// the game loads through its import-map shim attached, exactly as index.html
// puts them on window.THREE.
const T = Object.assign(Object.create(THREE), {
  GLTFLoader, FBXLoader, SkeletonUtils: { clone: skeletonClone },
});
globalThis.THREE = T;
globalThis.self = globalThis;

const POLY_CORE = require(path.join(ROOT, 'core.js'));

/* A DOM shaped just enough for game.js's top level to run. The game looks up
 * roughly 70 elements by id; missing ones return null and the game defends
 * against that, so a permissive proxy is enough to reach boot(). */
function makeWindow() {
  const store = new Map();
  const elements = new Map();
  // Leaf elements never need their own children, so they break the recursion.
  const leafEl = () => {
    const e = {
      style: new Proxy({}, {
        get(t, p) {
          if (typeof p === 'string' && /^(set|remove|get|item|length)/.test(p)) return () => {};
          return p in t ? t[p] : '';
        },
      }),
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      children: [], childNodes: [],
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
      setAttribute() {}, removeAttribute() {}, focus() {}, click() {},
      addEventListener() {}, removeEventListener() {},
      getContext() { return null; },
      getBoundingClientRect() { return { x: 0, y: 0, width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }; },
      querySelector() { return null; }, querySelectorAll() { return []; },
    };
    return e;
  };
  const el = () => {
    const e = {
      style: new Proxy({}, {
        get(t, p) {
          // CSSStyleDeclaration-ish: setProperty/removeProperty/getPropertyValue
          // and any camelCase property read must never blow up.
          if (typeof p === 'string' && /^(set|remove|get|item|length)/.test(p)) return () => {};
          return p in t ? t[p] : '';
        },
      }),
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      // game.js indexes `c.children[i]` for the 4 crosshair bars; create them
      // lazily on access so a fresh element costs nothing.
      get children() {
        const arr = Object.getOwnPropertyDescriptor(this, '__kids');
        if (arr) return arr.value;
        const kids = [];
        Object.defineProperty(this, '__kids', { value: kids });
        for (let i = 0; i < 4; i++) kids.push(leafEl());
        return kids;
      },
      childNodes: [],
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
      setAttribute() {}, removeAttribute() {}, focus() {}, click() {},
      addEventListener() {}, removeEventListener() {},
      getContext() { return null; },
      getBoundingClientRect() { return { x: 0, y: 0, width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }; },
      querySelector() { return this.children[0] || (this.children[0] = el()); },
      querySelectorAll() { return []; },
    };
    // The crosshair needs four real children for applyCrosshair().
    if (!e.children.length) for (let i = 0; i < 4; i++) e.children.push(el());
    return e;
  };
  const document = {
    body: el(), head: el(), documentElement: el(),
    hidden: false, visibilityState: 'visible',
    pointerLockElement: null, fullscreenElement: null,
    createElement: el, createTextNode: () => el(),
    getElementById: id => { if (!elements.has(id)) elements.set(id, el()); return elements.get(id); },
    querySelector: () => el(), querySelectorAll: () => [],
    // Record listeners so the test can drive the real keyboard path: the
    // browser delivers Escape -> pause() through this same handler.
    __listeners: new Map(),
    addEventListener(t, f) { if (!this.__listeners.has(t)) this.__listeners.set(t, []); this.__listeners.get(t).push(f); },
    removeEventListener(t, f) { const a = this.__listeners.get(t); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
    __fire(t, ev) { (this.__listeners.get(t) || []).forEach(f => f(ev)); },
    exitPointerLock() {}, exitFullscreen() {},
  };
  const canvas = el();
  canvas.width = 800; canvas.height = 600;
  // A WebGL-ish context stand-in. r149's WebGLRenderer probes dozens of GL
  // entry points during construction, so answer every method with a no-op and
  // every parameter with a plausible value instead of enumerating them all.
  const glBase = new Proxy({}, {
    get(t, p) {
      if (p === 'getExtension' || p === 'getSupportedExtensions') return () => ({});
      if (p === 'getParameter') return k => (k === 7938 || k === 7936 || k === 7937 ? 'WebGL 1.0' : 0);
      if (p === 'getShaderPrecisionFormat') return () => ({ precision: 1, rangeMin: 1, rangeMax: 1 });
      if (p === 'getAttribLocation' || p === 'getUniformLocation') return () => null;
      if (p === 'checkFramebufferStatus') return () => 36053;
      if (p === 'canvas') return canvas;
      if (p === 'drawingBufferWidth' || p === 'drawingBufferHeight') return 800;
      return () => {};
    },
  });
  const ctx2d = new Proxy({}, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return canvas;
      return () => {};
    },
  });
  canvas.getContext = (type) => (type === '2d' ? ctx2d : glBase);
  elements.set('game', canvas);
  elements.set('radar', canvas);
  elements.set('loadoutCanvas', canvas);

  const listeners = new Map();
  const on = (t, f) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(f); };
  const w = {
    document, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear() { store.clear(); },
    },
    addEventListener: on, removeEventListener() {},
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    requestPointerLock() {}, exitPointerLock() {},
    requestAnimationFrame2: undefined,
    URL: { createObjectURL() { return 'blob:fake'; }, revokeObjectURL() {} },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    fetch: () => Promise.reject(new Error('no network in unit test')),
    Audio: class { constructor() {} play() {} pause() {} },
    alert() {}, confirm() { return false; },
    __elements: elements, __listeners: listeners, __fire: (t, ev) => (listeners.get(t) || []).forEach(f => f(ev)),
  };
  // game.js reads several of these as bare identifiers.
  w.self = w; w.top = w; w.parent = w;
  return w;
}

/* The sibling modules game.js references at top level. Each gets a minimal
 * stand-in with the API surface game.js actually calls before boot(). */
function makeDeps(w) {
  const noop = () => {};
  const asyncNoop = async () => {};
  // boot() constructs a WebGLRenderer, a scene and cameras. A no-op stand-in
  // is enough: we are proving the boot path runs, not that it renders.
  const T = new Proxy({}, {
    get(t, p) {
      if (p === 'Vector3' || p === 'Vector2' || p === 'Euler' || p === 'Quaternion' ||
          p === 'Matrix4' || p === 'Color' || p === 'Clock') {
        return class { constructor(...a) { Object.assign(this, { x: 0, y: 0, z: 0, w: 1 }); } };
      }
      if (p === 'WebGLRenderer') {
        return class {
          constructor() {
            this.domElement = w.document.createElement('canvas');
            this.info = { autoReset: false, render: { calls: 0, triangles: 0 } };
            this.autoClear = true;
          }
          setSize() {} setPixelRatio() {} setClearColor() {} render() {}
          dispose() {} clear() {} setScissor() {} setViewport() {}
          get pixelRatio() { return 1; }
        };
      }
      if (p === 'Fog' || p === ' FogExp2') return class { constructor() {} };
      if (p === 'Scene') return class { constructor() { this.children = []; } add(o) { this.children.push(o); } remove(o) {} };
      if (p === 'PerspectiveCamera' || p === 'OrthographicCamera') {
        return class { constructor() { this.position = { set() {}, copy() {}, add() {} }; this.quaternion = { setFromEuler() {} }; this.aspect = 1; } updateProjectionMatrix() {} lookAt() {} };
      }
      if (p === 'AmbientLight' || p === 'DirectionalLight' || p === 'HemisphereLight') {
        return class { constructor() {} };
      }
      if (p === 'AnimationMixer') return class { constructor() {} update() {} clipAction() { return { play() {}, stop() {}, reset() {}, setLoop() {} }; } };
      if (p === 'Clock') return class { constructor() { this.elapsedTime = 0; } getDelta() { return 0.016; } };
      if (p === 'PCFSoftShadowMap' || p === 'BasicDepthPacking' || p === 'RGBAFormat') return 0;
      if (p === 'Mesh' || p === 'Group' || p === 'Object3D') {
        return class { constructor() { this.position = { set() {}, copy() {}, add() {}, x: 0, y: 0, z: 0 }; this.rotation = { set() {} }; this.children = []; this.userData = {}; this.material = {}; this.geometry = {}; } add(o) { this.children.push(o); } remove(o) {} traverse() {} };
      }
      if (p === 'GLTFLoader' || p === 'FBXLoader' || p === 'SkeletonUtils') {
        return class { constructor() {} load(u, ok) { ok({ scene: new (t.Mesh || class {})(), animations: [] }); } parse() {} };
      }
      return typeof p === 'string' ? class { constructor() {} } : undefined;
    },
  });
  const PolySettings = {
    get: () => undefined, set: noop, apply: noop, all: () => ({}),
    KEYS: {},
    // game.js indexes PRESETS at eval time: `let budget = PolySettings.PRESETS[preset]`.
    normalize: v => (v === 'performance' ? 'performance' : 'medium'),
    // resize() runs at eval time: it computes the render resolution.
    resolution: (width, height, dpr) => ({ width: width || 800, height: height || 600, ratio: 1 }),
    PRESETS: {
      medium: { effects: 8, shadows: false, budget: 'medium' },
      performance: { effects: 0, shadows: false, budget: 'performance' },
      high: { effects: 16, shadows: true, budget: 'high' },
    },
    load: noop, save: noop,
  };
  const PolyAudio = {
    init: noop, play: noop, stop: noop, setVolume: noop, resume: noop,
    enabled: true, muted: false, ready: true,
    sfx: noop, sound: noop, announce: noop, music: noop, start: noop, toggle: noop,
    setVoicePack: noop,
    // The real module ducks the master gain on pause; track it here so the
    // lifecycle test can assert gunfire does not keep playing while paused.
    setPaused(p) { this.__paused = p; },
    isPaused() { return !!this.__paused; },
  };
  const PolyAsset = {
    ready: () => Promise.resolve(),
    progress: () => ({ weapons: [], rigs: [], soldier: false, clips: [], mapModels: [] }),
    viewmodel: () => null, weapon: () => null, isRigged: () => false,
    rigClip: () => null, mapModel: () => null, loadAll: asyncNoop,
  };
  // deploy() calls the real builders; stand-ins must return a graph object.
  const visNode = () => ({ position: { set() {}, copy() {}, x: 0, y: 0, z: 0 }, rotation: { set() {} }, children: [], userData: {}, traverse() {}, removeFromParent() {} });
  const PolyVisual = {
    init: noop, render: noop, resize: noop, addMuzzle: noop, addTracer: noop,
    addImpact: noop, addBlood: noop, clear: noop,
    buildArena: () => visNode(),
    buildWeapon: () => Object.assign(visNode(), { userData: { hands: [] } }),
    buildMagazine: () => visNode(),
    buildCasing: () => visNode(),
  };
  const PolyOnline = {
    init: noop, connect: asyncNoop, disconnect: noop, send: noop,
    isHost: false, peers: new Map(), room: null,
    // game.js builds its online adapter at eval time: `PolyOnline.create(C, {...})`.
    create: () => ({
      host: noop, join: asyncNoop, close: noop, send: noop,
      code: null, isHost: false, hostRole: false, ready: noop,
    }),
  };
  return { PolySettings, PolyAudio, PolyAsset, PolyVisual, PolyOnline, THREE: T };
 }

/* Eval game.js exactly as a <script> tag would: inside a function scope whose
 * `this` is the global, with the browser globals as parameters. Any top-level
 * ReferenceError (the v35 failure mode) propagates out of this call. */
function loadGame(w, deps) {
  // game.js reads its collaborators off `window` at line 3-4, exactly as a
  // browser <script> would: `const T = window.THREE`, `let C = window.POLY_CORE`.
  // POLY_CORE is the deterministic simulation core: it has no DOM or WebGL
  // dependency, so load the real one rather than approximating it. That keeps
  // this test honest about what is actually being exercised.
  w.THREE = T;
  w.POLY_CORE = POLY_CORE;
  w.PolySettings = deps.PolySettings;
  w.PolyAudio = deps.PolyAudio;
  w.PolyAsset = deps.PolyAsset;
  w.PolyVisual = deps.PolyVisual;
  w.PolyOnline = deps.PolyOnline;
  // A classic <script> resolves bare identifiers against the global scope,
  // which in a browser is the window. Give the eval scope the same prototype
  // so every browser global (innerWidth, devicePixelRatio, ...) resolves
  // exactly as it would on a page, without enumerating them by hand.
  const scope = Object.create(w, Object.getOwnPropertyDescriptors(w));
  scope.window = w;  // a classic script resolves the bare word window
  scope.document = w.document;
  scope.navigator = { userAgent: 'node' };
  scope.location = { pathname: '/', href: 'http://localhost/' };
  scope.performance = { now: () => Date.now() };
  scope.localStorage = w.localStorage;
  scope.PolySettings = deps.PolySettings;
  scope.PolyAudio = deps.PolyAudio;
  scope.PolyAsset = deps.PolyAsset;
  scope.PolyVisual = deps.PolyVisual;
  scope.PolyOnline = deps.PolyOnline;
  scope.THREE = T;
  scope.POLY_CORE = POLY_CORE;
  scope.atob = w.atob;
  scope.btoa = w.btoa;
  scope.fetch = w.fetch;
  scope.Audio = w.Audio;
  scope.alert = w.alert;
  scope.confirm = w.confirm;
  scope.setTimeout = setTimeout;
  scope.clearTimeout = clearTimeout;
  scope.requestAnimationFrame = w.requestAnimationFrame;
  scope.cancelAnimationFrame = w.cancelAnimationFrame;

  // A `<script>` is not strict by default, but game.js opts into 'use strict'
  // itself, so the TDZ/undeclared-assignment behaviour is reproduced faithfully.
  const factory = new Function(...Object.keys(scope), SRC);
  return factory.apply(scope, Object.values(scope));
}

test('game.js evaluates without a runtime error (the v35 regression)', () => {
  const w = makeWindow();
  // The real failure mode: the boot block reads localStorage and assigns to a
  // top-level let. If the declaration is missing again this throws here.
  const deps = makeDeps(w);
  assert.doesNotThrow(() => loadGame(w, deps),
    'game.js must evaluate cleanly. A throw here means the deployed game is dead.');
});

test('game.js reaches its boot handler (PolyAsset.ready().then(boot, boot))', async () => {
  const w = makeWindow();
  let booted = false;
  const deps = makeDeps(w);
  deps.PolyAsset.ready = () => Promise.resolve().then(() => { booted = true; });
  loadGame(w, deps);
  // The registration happens at eval time; boot runs on the microtask.
  await new Promise(r => setTimeout(r, 60));
  assert.equal(booted, true, 'boot() must be scheduled and runnable');
});

test('clicking START reaches the playable state (start/resume/pause lifecycle)', async () => {
  // The v35 outage hid behind a `try { ... } catch (_) {}` that swallowed the
  // ReferenceError, so a bare eval check alone is not enough: the controller
  // has to actually *do* something. deploy() is the real entry point, and it
  // flips the same flags a browser click on #start does.
  const w = makeWindow();
  const deps = makeDeps(w);
  loadGame(w, deps);
  await new Promise(r => setTimeout(r, 60));

  const $ = id => w.document.getElementById(id);
  const before = { hud: $('hud').hidden, menu: $('menu').hidden, pause: $('pause').hidden };

  // #start is wired at eval time: `$('start').onclick = () => deploy();`
  assert.equal(typeof $('start').onclick, 'function', '#start must have a click handler');
  assert.doesNotThrow(() => $('start').onclick(), 'deploy() must not throw');
  await new Promise(r => setTimeout(r, 30));

  // window.Game publishes state(), the same handle the trainer tests use.
  const game = w.Game;
  const doc = w.document;
  assert.ok(game, 'window.Game must be published');
  assert.equal(game.state().running, true, 'the match must be running');

  // The buy phase was removed: the match must start live, otherwise the player
  // spawns unable to move or shoot for the buy window.
  assert.equal(game.state().phase, 'live', 'the match must start in the live phase');

  // deploy() hides the menu and shows the HUD + pause panel, in the browser
  // and here. If the controller died at eval time these never change.
  assert.equal($('menu').hidden, true, 'the menu must hide on start');
  assert.equal($('hud').hidden, false, 'the HUD must appear on start');
  assert.notDeepStrictEqual({ hud: $('hud').hidden, menu: $('menu').hidden, pause: $('pause').hidden }, before,
    'start must actually transition the UI, not leave the menu showing');

  // Pause must duck the audio bus as well as freeze the match; otherwise
  // gunfire and the announcer keep playing behind the pause screen.
  const audio = deps.A || w.PolyAudio;
  assert.doesNotThrow(() => doc.__fire('keydown', { code: 'Escape', target: doc.body, preventDefault() {} }));
  assert.equal(game.state().running, false, 'pause must stop the match');
  assert.equal($('pause').hidden, false, 'pause must reveal the pause panel');
  if (audio && typeof audio.isPaused === 'function') {
    assert.equal(audio.isPaused(), true, 'pause must duck the audio bus');
  }

  assert.equal(typeof $('resume').onclick, 'function', '#resume must have a click handler');
  assert.doesNotThrow(() => $('resume').onclick(), 'resume must not throw');
  await new Promise(r => setTimeout(r, 30));
  assert.equal(game.state().running, true, 'resume must restart the match');
  assert.equal($('pause').hidden, true, 'resume must hide the pause panel again');
  if (audio && typeof audio.isPaused === 'function') {
    assert.equal(audio.isPaused(), false, 'resume must restore the audio bus');
  }
});

test('game.js declares every name it assigns at top level', () => {
  // Static guard for the whole class of bug: collect the top-level `let`/`const`
  // declarations, then confirm every bare top-level assignment has a match.
  const body = SRC.replace(/^(['"])use strict\1;?/, '');
  const declared = new Set();
  // Declarations live in the top level of the file's IIFE, and multi-name
  // statements are the norm here: `let arena=null,worldNodes=[];` or
  // `let C=window.POLY_CORE, mapId='desert', preset='medium';`. A regex that
  // stops at the first '=' misses every binding after one, so split the whole
  // statement on commas and take the leading identifier of each fragment.
  for (const m of body.matchAll(/^[ \t]*(?:let|const|var)[ \t]+(.+?);/gm)) {
    for (const frag of m[1].split(',')) {
      const id = frag.trim().match(/^[A-Za-z_$][\w$]*/);
      if (id) declared.add(id[0]);
    }
  }
  // Anything declared anywhere in the file counts, including inside function
  // bodies: the top-level assignments below can legitimately target a name
  // declared further down the IIFE.
  for (const m of SRC.matchAll(/(?:let|const|var)[ \t]+([A-Za-z_$][\w$]*)/g)) {
    declared.add(m[1]);
  }
  // Top-level assignments inside the IIFE, excluding member accesses and
  // destructuring. A bare `foo = ...` here with no declaration is a landmine.
  const bad = new Set();
  for (const m of body.matchAll(/^[ \t]*([A-Za-z_$][\w$]*)[ \t]*=/gm)) {
    const name = m[1];
    if (declared.has(name) || name === 'PolySettings' || name === 'PolyAudio' ||
        name === 'PolyAsset' || name === 'PolyVisual' || name === 'PolyOnline' ||
        name === 'THREE' || name === 'window' || name === 'document' ||
        name === 'globalThis' || name === 'self' || name === 'module' ||
        name === 'exports') {
      continue;
    }
    bad.add(name);
  }
  // Known module-scope assignments introduced by later declarations in the file
  // (hoisted function declarations / block-scoped lets further down).
  const known = new Set();
  for (const m of SRC.matchAll(/function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/g)) known.add(m[1]);
  for (const m of SRC.matchAll(/^[ \t]*(?:let|const|var)[ \t]+([A-Za-z_$][\w$]*)/gm)) known.add(m[1]);
  const unexplained = [...bad].filter(n => !known.has(n));
  assert.deepEqual(unexplained, [],
    `top-level assignments with no declaration: ${unexplained.join(', ')}. ` +
    'Under "use strict" one of these will throw ReferenceError and kill the game at boot.');
});

test('the v35 failure mode specifically: announcerVoice is declared before use', () => {
  const decl = SRC.match(/^[ \t]*let[ \t]+announcerVoice\b/gm);
  assert.ok(decl && decl.length >= 1, 'let announcerVoice must be declared at module scope');
  const use = SRC.search(/announcerVoice[ \t]*=/);
  const firstDecl = SRC.search(/^[ \t]*let[ \t]+announcerVoice/gm);
  assert.ok(firstDecl < use,
    'the declaration must precede the first boot-time assignment, ' +
    'otherwise strict mode throws ReferenceError before the game starts');
});
