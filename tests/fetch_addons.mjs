'use strict';
/* Fetch the r149 GLTFLoader + its dependency chain into vendor/addons.
 * Run with: node tests/fetch_addons.mjs */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const GH = 'C:/Users/xtr18/AppData/Local/gh-portable/bin/gh.exe';
const REF = 'r149';
const NEED = [
  ['examples/jsm/loaders/GLTFLoader.js', 'loaders'],
  ['examples/jsm/loaders/DRACOLoader.js', 'loaders'],
  ['examples/jsm/loaders/KTX2Loader.js', 'loaders'],
  // FBXLoader reads the binary FBX animation packs; needs fflate to inflate.
  // FBXLoader pulls in NURBS curve helpers and fflate.
  ['examples/jsm/loaders/FBXLoader.js', 'loaders'],
  ['examples/jsm/curves/NURBSCurve.js', 'curves'],
  ['examples/jsm/curves/NURBSUtils.js', 'curves'],
  ['examples/jsm/curves/NURBSSurface.js', 'curves'],
  ['examples/jsm/libs/fflate.module.js', 'libs'],
  // SkeletonUtils is an addon, not part of the core namespace.
  ['examples/jsm/utils/SkeletonUtils.js', 'utils'],
  ['examples/jsm/utils/WorkerPool.js', 'utils'],
  ['examples/jsm/utils/BufferGeometryUtils.js', 'utils'],
];

// One tree call; index by path so each file costs a single blob request.
// The recursive tree JSON is multi-megabyte, so redirect it to a temp file and
// parse that — piping it through spawnSync overflows cmd.exe's buffer (ENOBUFS).
const treeFile = process.env.LOCALAPPDATA + '/Temp/three-r149-tree.json';
execSync(`"${GH}" api "repos/mrdoob/three.js/git/trees/${REF}?recursive=1" > "${treeFile}"`);
const tree = JSON.parse(readFileSync(treeFile, 'utf8'));
const byPath = new Map(tree.tree.filter(t => t.type === 'blob').map(t => [t.path, t.sha]));
console.log('tree blobs:', byPath.size);

for (const [path, dir] of NEED) {
  const sha = byPath.get(path);
  if (!sha) { console.error('MISSING in tree: ' + path); continue; }
  const blob = JSON.parse(execSync(`"${GH}" api "repos/mrdoob/three.js/git/blobs/${sha}"`).toString());
  const content = Buffer.from(blob.content, 'base64');
  const out = `vendor/addons/${dir}/${path.split('/').pop()}`;
  mkdirSync(`vendor/addons/${dir}`, { recursive: true });
  writeFileSync(out, content);
  console.log(`${content.length}  ${out}`);
}
