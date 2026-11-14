import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { PluginHandlerContext, PluginHookAgent } from '@getpaseo/plugin/server';
import type { DownloadFile } from '../shared/contracts';
import { extractFileLinks } from './links';
import { openWorkspaceFile } from './paths';

type Paseo = PluginHandlerContext['paseo'];
export async function agentScope(paseo: Paseo, agentId: string) {
  const snapshot = await paseo.agents.ref(agentId).refresh();
  const agent = snapshot?.agent;
  if (!agent?.workspaceId) throw new Error('This agent does not have an active workspace.');
  const workspace = await paseo.workspaces.ref(agent.workspaceId).refresh();
  const root = workspace?.workspaceDirectory;
  if (!root) throw new Error('The workspace is unavailable.');
  return { root, cwd: agent.cwd ?? root };
}

export async function publishDownloads(paseo: Paseo, agent: Pick<PluginHookAgent, 'id' | 'cwd'>, options: { path?: string; turnId?: string | null; baseline?: number } = {}) {
  const scope = await agentScope(paseo, agent.id);
  let paths: string[];
  let suffix: string = randomUUID();
  if (options.path) paths = [resolve(scope.cwd, options.path)];
  else {
    const page = await paseo.agents.ref(agent.id).timeline.refetch({ direction: 'tail', limit: 100, projection: 'canonical' });
    if (page.error) throw new Error(page.error);
    let entries = page.entries;
    const lastPrompt = entries.findLastIndex((entry) => entry.item.type === 'user_message');
    if (options.turnId && entries.some((entry) => entry.turnId === options.turnId)) entries = entries.filter((entry) => entry.turnId === options.turnId);
    else if (lastPrompt >= 0) entries = entries.slice(lastPrompt + 1);
    else if (options.baseline !== undefined) entries = entries.filter((entry) => entry.seqEnd > options.baseline!);
    else {
      const lastReply = entries.findLastIndex((entry) => entry.item.type === 'assistant_message');
      entries = lastReply >= 0 ? [entries[lastReply]] : [];
    }
    paths = entries.flatMap((entry) => entry.item.type === 'assistant_message' ? extractFileLinks(entry.item.text, scope.cwd) : []);
    const lastReply = entries.findLast((entry) => entry.item.type === 'assistant_message');
    suffix = options.turnId ?? lastReply?.turnId ?? String(lastReply?.seqEnd ?? page.window.maxSeq);
  }
  const files: DownloadFile[] = [];
  for (const path of new Set(paths)) {
    if (files.length >= 12) break;
    try {
      const file = await openWorkspaceFile(scope.root, path);
      await file.handle.close();
      files.push({ path, name: file.name, size: file.stamp.size });
    } catch (error) { if (options.path) throw error; }
  }
  if (files.length) await paseo.agents.ref(agent.id).timeline.append({
    type: 'plugin', id: 'downloads-' + suffix, kind: 'file-downloads', version: 1,
    data: { agentId: agent.id, files },
  });
  return { count: files.length };
}
