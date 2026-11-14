import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import WebSocket from 'ws';

export async function startHarness() {
  const app = process.env.PASEO_APP_DIST ?? '/opt/Paseo/resources/app-dist';
  const home = process.env.PASEO_HOME ?? homedir() + '/.paseo';
  const credential = (await readFile(home + '/local-credential', 'utf8')).trim();
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = resolve(app, '.' + pathname);
    if (!path.startsWith(resolve(app) + '/') && path !== resolve(app)) { response.writeHead(404).end(); return; }
    try {
      let bytes;
      try { bytes = await readFile(path); }
      catch { if (!extname(path)) { path = resolve(app, 'index.html'); bytes = await readFile(path); } else throw new Error('Not found'); }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
      response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream'); response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.routeWebSocket('**/*', (socket) => {
    const destination = new URL(socket.url());
    if (!['127.0.0.1', 'localhost'].includes(destination.hostname) || destination.port !== '6767') {
      socket.connectToServer(); return;
    }
    // A Node proxy avoids changing the daemon's CORS configuration for this isolated fixture.
    const remote = new WebSocket(socket.url());
    const pending = [];
    remote.on('open', () => { for (const message of pending) remote.send(message); pending.length = 0; });
    socket.onMessage((data) => {
      let payload = data;
      if (typeof data === 'string') {
        try {
          const message = JSON.parse(data);
          if (message.type === 'hello') { message.auth = { kind: 'localCredential', token: credential }; payload = JSON.stringify(message); }
        } catch { /* Binary transport data is forwarded unchanged. */ }
      }
      if (remote.readyState === WebSocket.OPEN) remote.send(payload); else pending.push(payload);
    });
    remote.on('message', (data, binary) => socket.send(binary ? data : data.toString()));
    remote.on('error', () => socket.close());
    remote.on('close', () => socket.close());
    socket.onClose(() => remote.close());
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  return { page, context, errors, url: 'http://127.0.0.1:' + server.address().port, async close() { await browser.close(); await new Promise((resolve) => server.close(resolve)); } };
}
