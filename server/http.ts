import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { openWorkspaceFile, sameFile, type FileStamp } from './paths';
import { candidateUrls } from './addresses';
import { endpointUrl } from '../shared/urls';
import type { Discovery } from '../shared/contracts';

export interface DownloadOptions { listenHost: string; port: number; publicUrl: string }
interface Ticket { root: string; path: string; stamp: FileStamp; expiresAt: number }
export function contentDisposition(name: string): string {
  const safe = name.replace(/[\x00-\x1f\x7f]/g, '_');
  const ascii = safe.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encoded;
}
export class DownloadService {
  private server: Server | null = null;
  private options: DownloadOptions = { listenHost: '127.0.0.1', port: 0, publicUrl: '' };
  private tickets = new Map<string, Ticket>();
  private probes = new Map<string, { proof: string; expiresAt: number }>();
  private generation = randomBytes(16).toString('hex');
  private changing: Promise<void> = Promise.resolve();
  private stopping = false;
  private failure: string | null = null;
  constructor(private readonly ttlMs = 5 * 60_000, private readonly now = Date.now) {}

  configure(options: DownloadOptions): Promise<void> {
    this.changing = this.changing.catch(() => undefined).then(async () => {
      if (this.stopping) return;
      const rebind = !this.server?.listening || options.port !== this.options.port || options.listenHost !== this.options.listenHost;
      this.options = { ...options };
      if (!rebind) return;
      await this.closeListener();
      const server = createServer((request, response) => {
        void this.serve(request, response).catch(() => {
          if (response.headersSent) response.destroy();
          else this.fail(response, 500, 'Download failed. Request a new link and retry.');
        });
      });
      this.server = server;
      server.headersTimeout = 15_000;
      server.requestTimeout = 30_000;
      server.keepAliveTimeout = 5_000;
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(options.port, options.listenHost, () => {
            server.removeListener('error', reject); resolve();
          });
        });
        const address = server.address();
        if (address && typeof address === 'object') this.options.port = address.port;
        this.failure = null;
        server.on('error', (error) => { this.failure = error.message; });
      } catch (error) {
        this.failure = error instanceof Error ? error.message : String(error);
        server.close(); this.server = null;
        console.error('[file-download] listener failed: ' + this.failure);
      }
    });
    return this.changing;
  }
  status() { return { listening: this.server?.listening ?? false, port: this.options.port, error: this.failure }; }

  async discover(): Promise<Discovery> {
    await this.changing;
    if (!this.server?.listening) throw new Error(this.failure ?? 'The download service is not running.');
    this.prune();
    while (this.probes.size >= 512) this.probes.delete(this.probes.keys().next().value!);
    const id = randomBytes(32).toString('base64url');
    const proof = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + 60_000;
    this.probes.set(id, { proof, expiresAt });
    return {
      candidates: candidateUrls(this.options.listenHost, this.options.port),
      manualUrl: this.options.publicUrl, generation: this.generation,
      probePath: '/probe/' + id, proof, expiresAt,
    };
  }

  async issue(root: string, path: string) {
    await this.changing;
    if (!this.server?.listening) throw new Error(this.failure ?? 'The download service is not running.');
    const opened = await openWorkspaceFile(root, path);
    await opened.handle.close();
    this.prune();
    while (this.tickets.size >= 512) this.tickets.delete(this.tickets.keys().next().value!);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    this.tickets.set(token, { root: opened.root, path: opened.path, stamp: opened.stamp, expiresAt });
    const downloadPath = '/download/' + token;
    return { url: this.options.publicUrl ? endpointUrl(this.options.publicUrl, downloadPath) : '', downloadPath, name: opened.name, expiresAt };
  }

  private async serve(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const probe = /^\/probe\/([A-Za-z0-9_-]{43})$/.exec(path);
    if (probe) {
      // Only discovery proofs allow cross-origin reads; download tickets remain private to RPC.
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
      if (request.method !== 'GET' && request.method !== 'HEAD') { this.fail(response, 405, 'Method not allowed.'); return; }
      this.prune();
      const challenge = this.probes.get(probe[1]);
      if (!challenge) { this.fail(response, 410, 'Discovery expired. Try again.'); return; }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ proof: challenge.proof })); return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD'); this.fail(response, 405, 'Method not allowed.'); return;
    }
    if (path === '/health') { response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}'); return; }
    const match = /^\/download\/([A-Za-z0-9_-]{43})$/.exec(path);
    if (!match) { this.fail(response, 404, 'Not found.'); return; }
    this.prune();
    const token = match[1];
    const ticket = this.tickets.get(token);
    if (!ticket) { this.fail(response, 410, 'This download link expired or was already used. Click Download again.'); return; }
    // HEAD can inspect a link; only GET claims the single-use ticket.
    if (request.method === 'GET') this.tickets.delete(token);
    let opened;
    try { opened = await openWorkspaceFile(ticket.root, ticket.path); }
    catch { this.fail(response, 404, 'The file is no longer available.'); return; }
    try {
      if (!sameFile(opened.stamp, ticket.stamp)) { this.fail(response, 409, 'The file changed. Click Download again.'); return; }
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Disposition', contentDisposition(opened.name));
      response.setHeader('Content-Length', opened.stamp.size);
      response.setHeader('Accept-Ranges', 'none');
      if (request.method === 'HEAD') { response.end(); return; }
      await pipeline(opened.handle.createReadStream({ autoClose: false, highWaterMark: 256 * 1024 }), response);
    } finally { await opened.handle.close().catch(() => undefined); }
  }
  private fail(response: ServerResponse, status: number, message: string) {
    response.statusCode = status; response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.end(message);
  }
  private prune() {
    for (const [token, ticket] of this.tickets) if (ticket.expiresAt <= this.now()) this.tickets.delete(token);
    for (const [id, probe] of this.probes) if (probe.expiresAt <= this.now()) this.probes.delete(id);
  }
  private async closeListener() {
    const server = this.server; this.server = null; this.tickets.clear(); this.probes.clear();
    this.generation = randomBytes(16).toString('hex');
    if (!server) return;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
  }
  async close() { this.stopping = true; await this.changing; await this.closeListener(); }
}
