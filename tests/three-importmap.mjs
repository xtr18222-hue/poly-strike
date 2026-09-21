// Bare-specifier importmap so vendored ES-module addons resolve 'three' under Node.
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const ROOT = 'C:/Users/xtr18/Projects/poly-strike';
const threeURL = pathToFileURL(path.join(ROOT, 'vendor/three.module.js')).href;
const addonsURL = pathToFileURL(path.join(ROOT, 'vendor/addons/')).href;
const code = `
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: ${JSON.stringify(threeURL)}, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) {
    const rel = specifier.slice('three/addons/'.length);
    return { url: ${JSON.stringify(addonsURL)} + rel, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  // THREE's loaders use fetch(); give Node a file: fetch for local assets.
  if (url.startsWith('file:')) {
    const { readFile } = await import('node:fs/promises');
    const p = new URL(url);
    const data = await readFile(p);
    const isJs = /\\.m?js$/.test(p.pathname);
    return { format: isJs ? 'module' : 'json', source: isJs ? data.toString('utf8') : data, shortCircuit: true };
  }
  return nextLoad(url, context);
}
`;
register('data:text/javascript,' + encodeURIComponent(code), import.meta.url);
// fetch polyfill for file: URLs (Three.js loaders call fetch on local files).
const _fetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const u = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (u.startsWith('file:')) {
    const fs = await import('node:fs/promises');
    const data = await fs.readFile(new URL(u));
    const headers = new Map([['content-length', String(data.length)]]);
    return { ok: true, status: 200, headers, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), text: async () => data.toString('utf8') };
  }
  return _fetch(input, init);
};
