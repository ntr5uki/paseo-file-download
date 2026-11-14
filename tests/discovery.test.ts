import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateUrls } from '../server/addresses';
import { DownloadService } from '../server/http';
import { EndpointResolver, DiscoveryError, probeEndpoint } from '../client/discovery';
import { endpointUrl } from '../shared/urls';
import type { Discovery } from '../shared/contracts';

const lan = 'http://192.168.1.20:6768';
const vpn = 'http://100.70.0.2:6768';
function manifest(overrides: Partial<Discovery> = {}): Discovery {
  return { candidates: [lan, vpn], manualUrl: '', generation: 'generation-one', probePath: '/probe/opaque-id', proof: 'expected-proof', expiresAt: Date.now() + 60_000, ...overrides };
}

test('generates LAN and Tailscale candidates without advertising Docker bridges or unsupported IPv6', () => {
  const interfaces = {
    wlan0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }],
    tailscale0: [{ address: '100.70.0.2', family: 'IPv4', internal: false }],
    docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
    eth0: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
  };
  const urls = candidateUrls('0.0.0.0', 6768, interfaces, 'devbox');
  assert.ok(urls.includes(lan)); assert.ok(urls.includes(vpn));
  assert.ok(urls.includes('http://devbox.local:6768'));
  assert.ok(!urls.some((url) => url.includes('172.17') || url.includes('fe80')));
  assert.deepEqual(candidateUrls('127.0.0.1', 6768, interfaces), ['http://127.0.0.1:6768']);
});

test('downloads with no configured URL, verifies the chosen daemon, and keeps file tokens out of probes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'paseo-discovery-'));
  const service = new DownloadService();
  const other = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end('{"proof":"wrong-daemon"}'); });
  await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await service.close(); other.closeAllConnections(); await new Promise<void>((resolve) => other.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  await service.configure({ listenHost: '127.0.0.1', port: 0, publicUrl: '' });
  const base = 'http://127.0.0.1:' + service.status().port;
  const otherAddress = other.address(); assert.ok(otherAddress && typeof otherAddress === 'object');
  const wrong = 'http://127.0.0.1:' + otherAddress.port;
  const bytes = Buffer.from([0, 255, 17, 0, 128]); await writeFile(join(root, 'setup.exe'), bytes);
  const ticket = await service.issue(root, 'setup.exe'); const discovery = await service.discover();
  assert.equal(ticket.url, ''); assert.equal(discovery.manualUrl, '');
  assert.notEqual(discovery.probePath.split('/').at(-1), discovery.proof);
  discovery.candidates = [wrong, base];
  const chosen = await new EndpointResolver().resolve('correct-host', discovery);
  assert.equal(chosen, base);
  const preflight = await fetch(endpointUrl(base, discovery.probePath), { method: 'OPTIONS', headers: { Origin: 'https://app.example', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  const probe = await fetch(endpointUrl(base, discovery.probePath));
  const proof = await probe.text(); assert.ok(!proof.includes(ticket.downloadPath) && !proof.includes('setup.exe'));
  assert.equal((await fetch(endpointUrl(base, '/probe/' + 'a'.repeat(43)))).status, 410);
  const response = await fetch(endpointUrl(chosen, ticket.downloadPath));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('remembers a verified address per host and re-discovers when it becomes unreachable', async () => {
  const calls: string[] = []; let reachable = lan;
  const resolver = new EndpointResolver(async (base) => { calls.push(base); return base === reachable; });
  assert.equal(await resolver.resolve('host', manifest()), lan);
  calls.length = 0;
  assert.equal(await resolver.resolve('host', manifest()), lan); assert.deepEqual(calls, [lan]);
  reachable = vpn; calls.length = 0;
  assert.equal(await resolver.resolve('host', manifest()), vpn); assert.deepEqual(calls, [lan, vpn]);
  calls.length = 0;
  assert.equal(await resolver.resolve('other-host', manifest()), vpn); assert.equal(calls.length, 2);
  calls.length = 0;
  assert.equal(await resolver.resolve('host', manifest({ generation: 'restarted-service' })), vpn); assert.equal(calls.length, 2);
});

test('separate client instances select their own reachable address and custom URLs override discovery', async () => {
  const desktop = new EndpointResolver(async (base) => base === lan);
  const phone = new EndpointResolver(async (base) => base === vpn);
  assert.equal(await desktop.resolve('same-host', manifest()), lan);
  assert.equal(await phone.resolve('same-host', manifest()), vpn);
  const manual = 'https://downloads.example/files';
  const resolver = new EndpointResolver(async () => { throw new Error('Manual overrides must not start discovery.'); });
  assert.equal(await resolver.resolve('host', manifest({ manualUrl: manual })), manual);
  assert.equal(endpointUrl(manual, '/download/ticket'), 'https://downloads.example/files/download/ticket');
});

test('wrong identities are rejected and unreachable probes time out or cancel', async (t) => {
  await assert.rejects(new EndpointResolver(async () => false).resolve('host', manifest()), DiscoveryError);
  const hanging = createServer(() => {});
  await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve));
  t.after(async () => { hanging.closeAllConnections(); await new Promise<void>((resolve) => hanging.close(() => resolve())); });
  const address = hanging.address(); assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port;
  assert.equal(await probeEndpoint(base, manifest(), undefined, 30), false);
  const controller = new AbortController();
  const pending = new EndpointResolver().resolve('host', manifest({ candidates: [base] }), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('discovery expires and a listener restart invalidates its previous proof', async (t) => {
  let now = 100;
  const service = new DownloadService(300_000, () => now);
  await service.configure({ listenHost: '127.0.0.1', port: 0, publicUrl: '' });
  t.after(() => service.close());
  const base = 'http://127.0.0.1:' + service.status().port;
  const old = await service.discover(); now = old.expiresAt;
  assert.equal((await fetch(endpointUrl(base, old.probePath))).status, 410);
  const current = await service.discover();
  assert.equal((await fetch(endpointUrl(base, current.probePath))).status, 200);
  await service.configure({ listenHost: '127.0.0.1', port: 0, publicUrl: '' });
  const nextBase = 'http://127.0.0.1:' + service.status().port;
  const next = await service.discover();
  assert.notEqual(next.generation, current.generation);
  assert.equal((await fetch(endpointUrl(nextBase, current.probePath))).status, 410);
});
