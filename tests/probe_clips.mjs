// Verify every newly registered CLIP_FILES entry is present on disk AND parses
// as a real Mixamo FBX with at least one AnimationClip. The registry can name a
// file that fails to load, which silently falls back to a static bot.
// The Hecate-style embedded-texture path does not apply here; FBXLoader is fine.
if (typeof self === 'undefined' && typeof globalThis !== 'undefined') globalThis.self = globalThis;

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MODELS = path.join(ROOT, 'assets', 'models');

// Re-declare the table from assets.js so a drift between it and this probe is
// impossible to overlook: this list is generated from the source file itself.
const src = fs.readFileSync(path.join(ROOT, 'assets.js'), 'utf8');
const start = src.indexOf('const CLIP_FILES = {');
const body = src.slice(start, src.indexOf('};', start) + 1);
const CLIP_FILES = {};
for (const m of body.matchAll(/^ {4}(\w+):\s*'([^']+)'/gm)) CLIP_FILES[m[1]] = m[2];

const loader = new FBXLoader();
const load = (p) => new Promise((res, rej) => {
  loader.load(url.pathToFileURL(p).href, res, undefined, rej);
});

let bad = 0;
for (const [key, rel] of Object.entries(CLIP_FILES)) {
  const p = path.join(MODELS, rel);
  try {
    if (!fs.existsSync(p)) throw new Error('MISSING on disk');
    const g = await load(p);
    const n = g.animations ? g.animations.length : 0;
    if (!n) throw new Error('no AnimationClip');
    const dur = g.animations[0].duration;
    // A degenerate clip (0 duration) would freeze the bot in place.
    if (!Number.isFinite(dur) || dur <= 0) throw new Error(`degenerate duration ${dur}`);
    console.log(`ok  ${key.padEnd(16)} ${rel.padEnd(38)} ${n} clip(s), ${dur.toFixed(2)}s`);
  } catch (e) {
    bad++;
    console.log(`FAIL ${key.padEnd(16)} ${rel.padEnd(38)} ${e.message}`);
  }
}
console.log(bad ? `\n${bad} clip(s) unusable` : `\nall ${Object.keys(CLIP_FILES).length} clips load and animate`);
process.exit(bad ? 1 : 0);
