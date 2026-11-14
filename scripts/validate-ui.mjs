import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { startHarness } from './ui-harness.mjs';

const workspaceId = process.env.PASEO_TEST_WORKSPACE;
if (!workspaceId) throw new Error('Set PASEO_TEST_WORKSPACE to the workspace containing the validation card.');
const home = process.env.PASEO_HOME ?? homedir() + '/.paseo';
const daemon = new DaemonClient({ url: 'ws://127.0.0.1:6767/ws', localCredential: () => readFile(home + '/local-credential', 'utf8').then((text) => text.trim()), clientId: 'file-download-ui-validation', clientType: 'cli', appVersion: '0.15.4', reconnect: { enabled: false } });
const rpc = (method, input) => daemon.invokePluginRpc('paseo-file-download', method, input);
await daemon.connect();
const serverId = daemon.getLastServerInfoMessage()?.serverId;
assert.ok(serverId);
const original = await rpc('settings.downloads.read', {});
assert.equal(original.status, 'ready');
await rpc('settings.downloads.write', { revision: original.revision, values: { ...original.values, publicUrl: '' } });
const harness = await startHarness();
await mkdir('artifacts', { recursive: true }); await mkdir('assets', { recursive: true });
try {
  const { page } = harness;
  await page.goto(harness.url);
  await page.getByText('File download plugin', { exact: true }).click();
  await page.getByText('可下载文件', { exact: true }).waitFor({ timeout: 15000 });
  const downloadButton = page.getByRole('button', { name: '下载 test-package.zip', exact: true });
  const probes = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/probe/')) probes.push(request.url()); });
  async function downloadFile(name) {
    const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
    assert.equal(download.suggestedFilename(), 'test-package.zip');
    await download.saveAs('artifacts/' + name);
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(await readFile('artifacts/' + name)), hash(await readFile('artifacts/test-package.zip')));
  }
  await downloadFile('browser-test-package.zip');
  assert.ok(probes.length > 0);
  console.log('Automatic discovery with an empty URL: browser filename and SHA-256 verified.');
  probes.length = 0;
  await downloadFile('browser-cached-package.zip');
  assert.equal(probes.length, 1);
  console.log('Cached endpoint was revalidated with one probe.');
  await page.route('**/probe/*', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"proof":"wrong-host"}' }));
  await downloadButton.click();
  await page.getByText('当前设备未找到可访问的下载地址。请确认下载端口可达，或在高级设置中指定地址。', { exact: true }).waitFor();
  await page.unroute('**/probe/*');
  await downloadFile('browser-recovered-package.zip');
  console.log('Wrong identities rejected, then automatic recovery succeeded.');
  const visibleCard = page.getByText('可下载文件', { exact: true }).locator('..').locator('..');
  await visibleCard.screenshot({ path: 'assets/download-card-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(350);
  await visibleCard.screenshot({ path: 'assets/download-card-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  await visibleCard.waitFor({ state: 'visible' }); await visibleCard.scrollIntoViewIfNeeded();
  const bounds = await visibleCard.boundingBox(); assert.ok(bounds && bounds.width <= 390);
  await visibleCard.screenshot({ path: 'assets/download-card-compact.png' });
  await page.getByRole('button', { name: '下载设置', exact: true }).click();
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByText(/^连接验证成功 · /).waitFor();
  await page.getByText('已发起下载', { exact: true }).last().waitFor({ state: 'hidden' });
  await page.getByTestId('download-settings').screenshot({ path: 'assets/settings-auto-compact.png' });
  const advanced = page.getByRole('button', { name: /高级设置/ }); await advanced.click();
  const url = page.getByPlaceholder('自动检测');
  assert.equal(await url.inputValue(), ''); await url.fill('http://127.0.0.1:6768');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByText('连接验证成功 · http://127.0.0.1:6768', { exact: true }).waitFor();
  console.log('Compact automatic settings and optional manual override verified.');
  const saved = await rpc('settings.downloads.read', {});
  await rpc('settings.downloads.write', { revision: saved.revision, values: { ...saved.values, publicUrl: '' } });
  const network = await rpc('download.discover', {});
  const alternate = network.candidates.filter((base) => /^http:\/\/(100\.|192\.168\.)/.test(base));
  for (const base of alternate) {
    await page.route('**/probe/*', (route) => new URL(route.request().url()).origin === base
      ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"proof":"wrong-host"}' }));
    await page.goto(harness.url + '/h/' + serverId + '/workspace/' + workspaceId);
    await page.getByText('可下载文件', { exact: true }).waitFor({ timeout: 15000 });
    await downloadFile('browser-alternate-package.zip');
    await page.unroute('**/probe/*');
    console.log('Verified automatic download using a real ' + (base.includes('100.') ? 'Tailscale' : 'LAN') + ' address.');
  }
  assert.deepEqual(harness.errors, []); console.log('No application page errors.');
} catch (error) {
  await harness.page.screenshot({ path: 'artifacts/ui-failure.png' });
  console.log('Visible UI:', (await harness.page.locator('body').innerText()).slice(-3500)); throw error;
} finally {
  const current = await rpc('settings.downloads.read', {});
  if (current.status === 'ready') await rpc('settings.downloads.write', { revision: current.revision, values: original.values });
  await harness.close(); await daemon.close();
}
