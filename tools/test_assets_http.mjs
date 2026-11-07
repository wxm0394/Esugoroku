// Esugoroku V2.1 Modular Asset System
// Automated Asset HTTP Endpoint Verification Tool
// Redesigned: starts its own HTTP server on a random port, performs real GET requests,
// distinguishes physical vs programmatic assets, and does NOT automatically pass HTTP 404s.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(ROOT_DIR, 'assets/manifest/asset-manifest.json');
const MOBILE_DIR = path.resolve(ROOT_DIR, 'mobile');
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');

// Find an available port using net module
function findAvailablePort(startPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      findAvailablePort(startPort + 1).then(resolve);
    });
  });
}

async function runHttpCheck() {
  console.log('----------------------------------------------------');
  console.log('Esugoroku V2.1 Asset HTTP Endpoint Checker');
  console.log('----------------------------------------------------');

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ Manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const assets = manifest.assets || {};
  const assetEntries = Object.entries(assets);

  // Start HTTP server on random port serving mobile directory
  const serverPort = await findAvailablePort(3000);
  const server = createServer((req, res) => {
    let pathname;
    try {
      const host = req.headers.host || 'localhost';
      pathname = new URL(`http://${host}${req.url}`, 'http://localhost').pathname;
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request\n');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Serve from mobile directory, root, or public directory
    let cleanPath = pathname.replace(/^\//, '');
    let filePath = path.resolve(ROOT_DIR, cleanPath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.resolve(MOBILE_DIR, cleanPath);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.resolve(PUBLIC_DIR, cleanPath);
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found\n');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = {
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
    }[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error\n');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': String(data.length) });
      res.end(data);
    });
  });

  await new Promise((resolve) => server.listen(serverPort, resolve));
  const baseUrl = `http://localhost:${serverPort}`;
  console.log(`Server started on port ${serverPort}`);

  let successCount = 0;
  let programmaticCount = 0;
  let failureCount = 0;
  const failures = [];
  const checked = new Set();

  for (const [id, def] of assetEntries) {
    if (!def.path) {
      continue;
    }

    // Skip data: URIs (programmatic/synthetic by definition)
    if (def.path.startsWith('data:')) {
      programmaticCount++;
      continue;
    }

    // Normalize path
    const cleanPath = def.path.replace(/^\//, '');
    const url = `${baseUrl}/${cleanPath}`;

    // Determine if this is a programmatic asset
    const isProgrammatic = def.sourceType === 'programmatic';

    if (checked.has(id)) continue;
    checked.add(id);

    try {
      const res = await fetch(url, { method: 'GET' });

      if (res.ok) {
        successCount++;
      } else if (res.status === 404) {
        if (isProgrammatic) {
          programmaticCount++;
        } else {
          failureCount++;
          failures.push(`${id} -> ${url} (HTTP 404 - physical asset not found)`);
        }
      } else {
        failureCount++;
        failures.push(`${id} -> ${url} (HTTP ${res.status})`);
      }
    } catch (err) {
      if (isProgrammatic) {
        programmaticCount++;
      } else {
        failureCount++;
        failures.push(`${id} -> ${url} (fetch error: ${err.message})`);
      }
    }
  }

  server.close();

  console.log(`\nTotal Assets Checked: ${assetEntries.length}`);
  console.log(`✅ HTTP 200 OK: ${successCount}`);
  console.log(`⚠️ Programmatic/Synthetic (expected missing): ${programmaticCount}`);
  console.log(`❌ Failed Endpoints: ${failureCount}`);

  if (failures.length > 0) {
    console.log('\nFailed Endpoints List:');
    failures.forEach(f => console.log(`  - ${f}`));
    console.log('\n❌ HTTP check FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ All asset HTTP endpoints verified successfully.');
  }
}

runHttpCheck();
