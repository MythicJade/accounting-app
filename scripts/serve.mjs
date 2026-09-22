import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel) || /(^|[\\/])\./.test(rel)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('Preview http://127.0.0.1:4173'));
