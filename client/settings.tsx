import type { PluginSurfaceProps } from '@getpaseo/plugin/client';
import { useRpc, useSettings, useTranslation } from '@getpaseo/plugin/client';
import { SettingsSection, SettingsInput, SettingsRow, SettingsSelect, SettingsSwitch } from '@getpaseo/plugin/client/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { downloadStatus, preferences, preferencesSchema, type Preferences } from '../shared/contracts';
import { messages } from './messages';

export function SettingsScreen(props: PluginSurfaceProps) {
  const state = useSettings(preferences);
  const { t } = useTranslation(messages);
  if (state.status !== 'ready') return <Text style={{ color: props.theme.colors.foreground, padding: 16 }}>{state.status === 'loading' ? t('loading') : state.error}</Text>;
  return <SettingsForm key={state.revision} {...props} initial={state.values} saving={state.saving} saveError={state.saveError}
    save={(values) => state.save(values, state.revision)} />;
}
function SettingsForm({ theme, layout, initial, saving, saveError, save }: PluginSurfaceProps & {
  initial: Preferences; saving: boolean; saveError: string | null; save(values: Preferences): Promise<boolean>;
}) {
  const [draft, setDraft] = useState(initial);
  const [port, setPort] = useState(String(initial.port));
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation(messages);
  const statusRpc = useRpc(downloadStatus);
  const status = useQuery({ queryKey: ['file-download-service'], queryFn: () => statusRpc({}), refetchInterval: 5000 });
  const submit = async () => {
    const parsed = preferencesSchema.safeParse({ ...draft, port: Number(port) });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(' ')); return; }
    setError(null); await save(parsed.data); await status.refetch();
  };
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 18 }}>
    <Text style={{ color: theme.colors.foregroundMuted }}>{t('settingsHint')}</Text>
    <SettingsSection title={t('settingsTitle')}>
      <SettingsInput label={t('publicUrl')} hint={t('publicUrlHint')} initialValue={initial.publicUrl} placeholder="http://192.168.1.20:6768"
        onChangeText={(publicUrl) => setDraft((value) => ({ ...value, publicUrl }))} />
      <SettingsInput label={t('port')} initialValue={String(initial.port)} onChangeText={setPort} />
      <SettingsSelect label={t('listener')} value={draft.listenHost}
        options={[{ label: t('allInterfaces'), value: '0.0.0.0' }, { label: t('loopback'), value: '127.0.0.1' }]}
        onValueChange={(listenHost) => setDraft((value) => ({ ...value, listenHost }))} />
      <SettingsSwitch label={t('autoCards')} hint={t('autoCardsHint')} value={draft.autoCards}
        onValueChange={(autoCards) => setDraft((value) => ({ ...value, autoCards }))} />
    </SettingsSection>
    <View style={{ gap: 10 }}>
      {error || saveError ? <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{error ?? saveError}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.accent }}>
        <Text style={{ color: theme.colors.accentForeground, fontWeight: '600' }}>{saving ? t('saving') : t('save')}</Text>
      </Pressable>
    </View>
    <SettingsSection title={t('title')}>
      <SettingsRow label={status.data?.listening ? t('running') + ' · ' + status.data.port : t('stopped')}>
        <Text selectable style={{ color: theme.colors.foregroundMuted }}>{status.data?.error ?? (status.error ? status.error.message : draft.publicUrl || t('setupHint'))}</Text>
      </SettingsRow>
    </SettingsSection>
  </ScrollView>;
}
