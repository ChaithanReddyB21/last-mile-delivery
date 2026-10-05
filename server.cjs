// Dependency-free, loopback-only preview. Never exposes the surrounding workspace.
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = __dirname, port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end('Method not allowed'); }
  let relative;
  try { relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (relative === '/') relative = '/index.html';
  const file = path.resolve(root, '.' + relative), extension = path.extname(file);
  if (!file.startsWith(root + path.sep) || relative.split('/').some(part => part.startsWith('.')) || !types[extension]) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set PORT to another free port.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Nexus delivery lab: http://127.0.0.1:${port}`));
