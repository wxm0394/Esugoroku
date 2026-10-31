#!/usr/bin/env node
'use strict';

// Zero-dependency static preview server for E-Sugoroku.
// Serves ./mobile on port 8090 by default with strict no-cache headers.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, 'mobile');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

function securityHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self' blob:; " +
      "object-src 'none'; base-uri 'self'",
    ...extra,
  };
}

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const normalized = path.posix.normalize(decoded.replace(/\\/g, '/'));
  const relative = normalized.replace(/^\/+/, '');
  const absolute = path.resolve(ROOT, relative || 'index.html');
  if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) return null;
  return absolute;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, securityHeaders({ Allow: 'GET, HEAD', 'Content-Length': '0' }));
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  } catch {
    res.writeHead(400, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Bad Request\n');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  let file = safePath(pathname);
  if (!file) {
    res.writeHead(403, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Forbidden\n');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end('Not Found\n');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const mime = path.basename(file) === 'manifest.json'
      ? 'application/manifest+json; charset=utf-8'
      : (MIME[ext] || 'application/octet-stream');
    const headers = securityHeaders({
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Last-Modified': stat.mtime.toUTCString(),
    });
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
      }
      res.end('Internal Server Error\n');
    });
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`絵双六 ─ E-Sugoroku`);
  console.log(`  serving ${ROOT}`);
  console.log(`  http://localhost:${PORT}/`);
  console.log(`  Cache-Control: no-store, no-cache, must-revalidate`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

module.exports = server;
