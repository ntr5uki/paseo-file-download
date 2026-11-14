import type { PluginClientContext, PluginTimelineItemProps } from '@getpaseo/plugin/client';
import { cardSchema, collectDownloads, type DownloadCardData } from './shared/contracts';
import { DownloadCard } from './client/card';
import { SettingsScreen } from './client/settings';
import { messages } from './client/messages';

export default function contribute(client: PluginClientContext) {
  function Card(props: PluginTimelineItemProps<DownloadCardData>) {
    return <DownloadCard {...props} onSettings={() => client.openSettings('downloads')} />;
  }
  client.addTimelineRenderer({ kind: 'file-downloads', version: 1, schema: cardSchema, Component: Card });
  client.addSettingsScreen({ id: 'downloads', title: messages.message('settingsTitle'), icon: 'Download', Component: SettingsScreen });
  client.addCommandCenterItem({ id: 'download-settings', title: messages.message('settingsTitle'), icon: 'Settings', context: 'global',
    onSelect: () => client.openSettings('downloads'),
  });
  client.addCommandCenterItem({ id: 'download-latest', title: messages.message('latest'), icon: 'Download', context: 'agent',
    async onSelect({ agent, rpc }) {
      const result = await rpc(collectDownloads, { agentId: agent.id });
      if (!result.count) throw new Error(client.i18n.t(messages, 'noFiles'));
    },
  });
  client.addSlashCommand({ name: 'download', description: messages.message('command'), argumentHint: '[path]', context: 'agent',
    async onSubmit({ agent, args, rpc }) {
      let path = args.trim();
      if (path.length >= 2 && (path[0] === '"' || path[0] === "'") && path.at(-1) === path[0]) path = path.slice(1, -1);
      const result = await rpc(collectDownloads, { agentId: agent.id, ...(path ? { path } : {}) });
      if (!result.count) throw new Error(client.i18n.t(messages, 'noFiles'));
    },
  });
  return () => {};
}
