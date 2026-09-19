// Minimal static file server for local Playwright test runs.
// Usage: node tests/serve.mjs [port] [root]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const PORT = Number(process.argv[2] || 18959);
const ROOT = resolve(process.argv[3] || './');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown',
};
const started = new Set();
createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let p = normalize(join(ROOT, url === '/' ? '/index.html' : url));
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    let s;
    try { s = await stat(p); } catch { res.writeHead(404); return res.end('not found'); }
    if (s.isDirectory()) { p = join(p, 'index.html'); }
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
    if (!started.has(p)) { started.add(p); console.log('200', req.url); }
  } catch (e) {
    res.writeHead(500); res.end('error: ' + e.message);
    console.error('ERR', e.message);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}/`));
