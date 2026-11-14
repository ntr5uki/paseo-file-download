import type { PluginSurfaceProps } from '@getpaseo/plugin/client';
import { useRpc, useSettings, useTranslation } from '@getpaseo/plugin/client';
import { SettingsSection, SettingsInput, SettingsRow, SettingsSelect, SettingsSwitch } from '@getpaseo/plugin/client/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { discoverDownloads, downloadStatus, preferences, preferencesSchema, type Preferences } from '../shared/contracts';
import { DiscoveryError, endpoints, probeEndpoint } from './discovery';
import { messages } from './messages';

export function SettingsScreen(props: PluginSurfaceProps) {
  const state = useSettings(preferences);
  const { t } = useTranslation(messages);
  if (state.status !== 'ready') return <Text style={{ color: props.theme.colors.foreground, padding: 16 }}>{state.status === 'loading' ? t('loading') : state.error}</Text>;
  return <SettingsForm key={state.revision} {...props} initial={state.values} saving={state.saving} saveError={state.saveError}
    save={(values) => state.save(values, state.revision)} />;
}
function SettingsForm({ theme, layout, host, initial, saving, saveError, save }: PluginSurfaceProps & {
  initial: Preferences; saving: boolean; saveError: string | null; save(values: Preferences): Promise<boolean>;
}) {
  const [draft, setDraft] = useState(initial);
  const [port, setPort] = useState(String(initial.port));
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation(messages);
  const statusRpc = useRpc(downloadStatus);
  const discover = useRpc(discoverDownloads);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const status = useQuery({ queryKey: ['file-download-service'], queryFn: () => statusRpc({}), refetchInterval: 5000 });
  const dirty = port !== String(initial.port) || draft.publicUrl !== initial.publicUrl || draft.listenHost !== initial.listenHost || draft.autoCards !== initial.autoCards;
  const connection = useMutation({ mutationFn: async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const discovery = await discover({});
    const base = await endpoints.resolve(host.id, discovery, controller.signal);
    if (discovery.manualUrl && !await probeEndpoint(base, discovery, controller.signal)) throw new DiscoveryError();
    return base;
  } });
  const submit = async () => {
    const parsed = preferencesSchema.safeParse({ ...draft, port: Number(port) });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(' ')); return; }
    setError(null); await save(parsed.data); await status.refetch();
  };
  return <ScrollView testID="download-settings" style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 18 }}>
    <Text style={{ color: theme.colors.foregroundMuted }}>{t('settingsHint')}</Text>
    <SettingsSection title={t('connectionTitle')}>
      <SettingsRow label={status.data?.listening ? t('running') + ' · ' + status.data.port : t('stopped')}>
        <Text selectable style={{ color: theme.colors.foregroundMuted }}>{status.data?.error ?? status.error?.message ?? (initial.publicUrl || t('automatic'))}</Text>
      </SettingsRow>
      <Pressable accessibilityRole="button" disabled={dirty || saving || connection.isPending} onPress={() => connection.mutate()}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.colors.surface2, opacity: dirty || connection.isPending ? 0.6 : 1 }}>
        <Text style={{ color: theme.colors.foreground }}>{connection.isPending ? t('checking') : t('testConnection')}</Text>
      </Pressable>
      {dirty ? <Text style={{ color: theme.colors.foregroundMuted }}>{t('saveFirst')}</Text> : connection.data ?
        <Text selectable style={{ color: theme.colors.foreground }}>{t('verified') + ' · ' + connection.data}</Text> : null}
      {connection.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{connection.error instanceof DiscoveryError ? t('discoveryFailed') : connection.error.message}</Text> : null}
    </SettingsSection>
    <SettingsSection title={t('settingsTitle')}>
      <SettingsSwitch label={t('autoCards')} hint={t('autoCardsHint')} value={draft.autoCards}
        onValueChange={(autoCards) => setDraft((value) => ({ ...value, autoCards }))} />
    </SettingsSection>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced((value) => !value)} style={{ paddingVertical: 8 }}>
      <Text style={{ color: theme.colors.foreground, fontWeight: '600' }}>{(advanced ? '▾ ' : '▸ ') + t('advanced')}</Text>
    </Pressable>
    {advanced ? <SettingsSection title={t('advanced')}>
      <SettingsInput label={t('publicUrl')} hint={t('publicUrlHint')} initialValue={draft.publicUrl} placeholder={t('automatic')}
        onChangeText={(publicUrl) => setDraft((value) => ({ ...value, publicUrl }))} />
      <SettingsInput label={t('port')} initialValue={port} onChangeText={setPort} />
      <SettingsSelect label={t('listener')} value={draft.listenHost}
        options={[{ label: t('allInterfaces'), value: '0.0.0.0' }, { label: t('loopback'), value: '127.0.0.1' }]}
        onValueChange={(listenHost) => setDraft((value) => ({ ...value, listenHost }))} />
    </SettingsSection> : null}
    <View style={{ gap: 10 }}>
      {error || saveError ? <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{error ?? saveError}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.accent }}>
        <Text style={{ color: theme.colors.accentForeground, fontWeight: '600' }}>{saving ? t('saving') : t('save')}</Text>
      </Pressable>
    </View>
  </ScrollView>;
}
