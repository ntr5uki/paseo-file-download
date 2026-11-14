import type { PluginServerContext } from '@getpaseo/plugin/server';
import { collectDownloads, discoverDownloads, downloadStatus, preferences, prepareDownload } from './shared/contracts';
import { agentScope, publishDownloads } from './server/cards';
import { DownloadService } from './server/http';

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  const service = new DownloadService();
  let active = true;
  let autoCards = true;
  const configure = async () => {
    const state = await settings.read();
    if (!active) return;
    if (state.status !== 'ready') { console.error('[file-download] Invalid settings: ' + state.error); return; }
    autoCards = state.values.autoCards;
    await service.configure(state.values);
  };
  const initial = configure().catch((error) => console.error('[file-download] Startup failed:', String(error)));
  const unsubscribe = settings.subscribe(() => configure().catch((error) => console.error('[file-download] Settings failed:', String(error))));
  const baselines = new Map<string, Promise<number>>();
  const removeStart = server.addHook('agent.turn.before', async ({ agent }, { paseo }) => {
    const baseline = paseo.agents.ref(agent.id).timeline.refetch({ direction: 'tail', limit: 1, projection: 'canonical' }).then((page) => page.window.maxSeq).catch(() => -1);
    baselines.set(agent.id, baseline);
    await baseline;
  });
  const removeEnd = server.addHook('agent.turn.after', async ({ agent, turnId, outcome }, { paseo }) => {
    const baseline = baselines.get(agent.id); baselines.delete(agent.id);
    if (!active || !autoCards || !agent.workspaceId || outcome.kind !== 'completed') return;
    try { await publishDownloads(paseo, agent, { turnId, baseline: await baseline }); }
    catch (error) { console.error('[file-download] Could not add download card:', String(error)); }
  });
  const removeClose = server.addHook('agent.close.after', async ({ agent }) => { baselines.delete(agent.id); });
  server.handle(prepareDownload, async ({ agentId, path }, { paseo }) => {
    await initial;
    await configure();
    const scope = await agentScope(paseo, agentId);
    return { ...await service.issue(scope.root, path), discovery: await service.discover() };
  });
  server.handle(discoverDownloads, async () => { await initial; await configure(); return service.discover(); });
  server.handle(collectDownloads, async ({ agentId, path }, { paseo }) => publishDownloads(paseo, { id: agentId, cwd: '' }, { path }));
  server.handle(downloadStatus, async () => { await initial; return service.status(); });
  return async () => {
    active = false; unsubscribe(); removeStart(); removeEnd(); removeClose(); baselines.clear();
    await initial; await service.close();
  };
}
