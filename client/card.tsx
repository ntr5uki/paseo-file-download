import type { PluginTimelineItemProps } from '@getpaseo/plugin/client';
import { useRpc, useTranslation } from '@getpaseo/plugin/client';
import { Icon, useToast } from '@getpaseo/plugin/client/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { prepareDownload, type DownloadCardData, type DownloadFile } from '../shared/contracts';
import { messages } from './messages';
import { saveDownload } from './web';
import { DiscoveryError, endpoints } from './discovery';
import { endpointUrl } from '../shared/urls';

export function formatBytes(size: number): string {
  if (size < 1024) return size + ' B';
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3);
  return (size / 1024 ** unit).toFixed(1) + ' ' + ['B', 'KiB', 'MiB', 'GiB'][unit];
}
function FileRow({ file, agentId, hostId, theme }: { file: DownloadFile; agentId: string; hostId: string; theme: PluginTimelineItemProps<DownloadCardData>['theme'] }) {
  const prepare = useRpc(prepareDownload);
  const { t } = useTranslation(messages);
  const toast = useToast();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [hostId, agentId]);
  const download = useMutation({
    mutationFn: async () => {
      request.current?.abort();
      const controller = new AbortController(); request.current = controller;
      const ticket = await prepare({ agentId, path: file.path });
      const base = await endpoints.resolve(hostId, ticket.discovery, controller.signal);
      if (controller.signal.aborted) return;
      await saveDownload(endpointUrl(base, ticket.downloadPath), ticket.name);
    },
    onSuccess: () => { if (!request.current?.signal.aborted) toast.show(t('started')); },
  });
  const error = download.error?.message;
  const errorText = download.error instanceof DiscoveryError ? t('discoveryFailed') : error?.replace(/^Request failed:\s*/, '').replace(/\s+requestType=.*$/, '');
  return <View style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Icon name="File" size={20} color={theme.colors.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text selectable numberOfLines={2} style={{ color: theme.colors.foreground, fontWeight: '600' }}>{file.name}</Text>
        <Text selectable numberOfLines={2} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{formatBytes(file.size)} · {file.path}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('download') + ' ' + file.name} disabled={download.isPending}
        onPress={() => download.mutate()} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 7, backgroundColor: theme.colors.accent, opacity: download.isPending ? 0.6 : 1 }}>
        <Text style={{ color: theme.colors.accentForeground, fontWeight: '600' }}>{download.isPending ? t('preparing') : t('download')}</Text>
      </Pressable>
    </View>
    {errorText ? <Text accessibilityRole="alert" selectable style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{errorText}</Text> : null}
  </View>;
}
export function DownloadCard({ item, theme, layout, host, onSettings }: PluginTimelineItemProps<DownloadCardData> & { onSettings(): void }) {
  const { t } = useTranslation(messages);
  return <View style={{ padding: layout.compact ? 12 : 16, borderRadius: 10, backgroundColor: theme.colors.surface1, gap: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="Download" size={18} color={theme.colors.foreground} />
      <Text style={{ color: theme.colors.foreground, fontWeight: '600', fontSize: 14 }}>{t('cardTitle')}</Text>
    </View>
    {item.data.files.map((file) => <FileRow key={file.path} file={file} agentId={item.data.agentId} hostId={host.id} theme={theme} />)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{t('browserHint')}</Text>
      <Pressable accessibilityRole="button" onPress={onSettings} style={{ paddingVertical: 4 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, textDecorationLine: 'underline' }}>{t('settingsTitle')}</Text>
      </Pressable>
    </View>
  </View>;
}
