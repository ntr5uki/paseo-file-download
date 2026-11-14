import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DownloadService } from '../server/http';
import { openWorkspaceFile } from '../server/paths';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'paseo-download-test-'));
  const root = join(directory, 'workspace'); await mkdir(root);
  const service = new DownloadService();
  await service.configure({ listenHost: '127.0.0.1', port: 0, publicUrl: '' });
  const base = 'http://127.0.0.1:' + service.status().port;
  await service.configure({ listenHost: '127.0.0.1', port: service.status().port, publicUrl: base });
  t.after(async () => { await service.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, root, service, base };
}

test('streams binary bytes with their original name; HEAD preserves a ticket and GET consumes it', async (t) => {
  const { root, service } = await fixture(t);
  const bytes = Buffer.from(Array.from({ length: 65536 }, (_, i) => i % 256));
  const name = '安装 包 (1).exe'; await writeFile(join(root, name), bytes);
  const ticket = await service.issue(root, name);
  assert.equal((await fetch(ticket.url, { method: 'HEAD' })).status, 200);
  const response = await fetch(ticket.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  assert.ok(response.headers.get('content-disposition')!.includes('filename*=UTF-8'));
  assert.ok(response.headers.get('content-disposition')!.includes(encodeURIComponent('安装')));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal((await fetch(ticket.url)).status, 410);
});

test('streams an installer larger than 64 MiB and verifies its complete hash', async (t) => {
  const { root, service } = await fixture(t);
  const path = join(root, 'large-installer.bin');
  await writeFile(path, 'binary-header'); await truncate(path, 80 * 1024 * 1024 + 7);
  const ticket = await service.issue(root, path);
  const response = await fetch(ticket.url);
  assert.equal(response.status, 200);
  const actual = createHash('sha256'); let received = 0;
  for await (const part of response.body!) { actual.update(part); received += part.length; }
  const { createReadStream } = await import('node:fs');
  const expected = createHash('sha256'); for await (const part of createReadStream(path)) expected.update(part);
  assert.equal(received, 80 * 1024 * 1024 + 7);
  assert.equal(actual.digest('hex'), expected.digest('hex'));
});

test('rejects traversal, hidden files, escaping symlinks, folders, and unknown tokens', async (t) => {
  const { root, directory, service, base } = await fixture(t);
  await writeFile(join(directory, 'outside.exe'), 'outside');
  await writeFile(join(root, '.env'), 'secret');
  await symlink(join(directory, 'outside.exe'), join(root, 'escape.exe'));
  await mkdir(join(root, 'folder'));
  for (const path of ['../outside.exe', '.env', 'escape.exe', 'folder']) await assert.rejects(service.issue(root, path));
  assert.equal((await fetch(base + '/download/' + 'a'.repeat(43))).status, 410);
  assert.equal((await fetch(base + '/download/../../etc/passwd')).status, 404);
  assert.equal((await fetch(base + '/health', { method: 'POST' })).status, 405);
});

test('supports a workspace reached through a symlink while still rejecting outside targets', async (t) => {
  const { root, directory } = await fixture(t);
  const alias = join(directory, 'workspace-alias'); await symlink(root, alias);
  await writeFile(join(root, 'inside.exe'), 'inside');
  for (const path of ['inside.exe', join(alias, 'inside.exe'), join(root, 'inside.exe')]) {
    const file = await openWorkspaceFile(alias, path);
    assert.equal(file.name, 'inside.exe'); await file.handle.close();
  }
  await writeFile(join(directory, 'outside.exe'), 'outside');
  await assert.rejects(openWorkspaceFile(alias, '../outside.exe'));
});

test('rejects modified files and file replacement after a ticket is issued', async (t) => {
  const { root, service } = await fixture(t);
  const path = join(root, 'setup.exe'); await writeFile(path, 'original');
  const first = await service.issue(root, path); await writeFile(path, 'modified and larger');
  assert.equal((await fetch(first.url)).status, 409);
  const second = await service.issue(root, path); await rm(path); await symlink('/etc/passwd', path);
  assert.equal((await fetch(second.url)).status, 404);
});

test('expires tickets without waiting and supports empty files', async (t) => {
  const { root } = await fixture(t); let now = 100;
  const service = new DownloadService(50, () => now);
  await service.configure({ listenHost: '127.0.0.1', port: 0, publicUrl: '' });
  await service.configure({ listenHost: '127.0.0.1', port: service.status().port, publicUrl: 'http://127.0.0.1:' + service.status().port });
  t.after(() => service.close());
  await writeFile(join(root, 'empty.zip'), '');
  const expired = await service.issue(root, 'empty.zip'); now += 50;
  assert.equal((await fetch(expired.url)).status, 410);
  const current = await service.issue(root, 'empty.zip'); const response = await fetch(current.url);
  assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('an interrupted stream releases the connection and the service can rebind', async (t) => {
  const { root, service } = await fixture(t);
  const path = join(root, 'cancel.bin'); await writeFile(path, 'start'); await truncate(path, 256 * 1024 * 1024);
  const ticket = await service.issue(root, path);
  const abort = new AbortController();
  const response = await fetch(ticket.url, { signal: abort.signal });
  const reader = response.body!.getReader(); await reader.read(); abort.abort();
  await reader.cancel().catch(() => undefined);
  const port = service.status().port;
  await service.close();
  const replacement = new DownloadService();
  await replacement.configure({ listenHost: '127.0.0.1', port, publicUrl: 'http://127.0.0.1:' + port });
  t.after(() => replacement.close());
  assert.equal(replacement.status().listening, true);
});
