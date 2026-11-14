import { defineRpc, defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';

export const preferencesSchema = z.object({
  publicUrl: z.string().trim().default('').refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }, 'Use an HTTP(S) URL without a password, query or fragment.'),
  listenHost: z.enum(['127.0.0.1', '0.0.0.0']).default('0.0.0.0'),
  port: z.number().int().min(1024).max(65535).default(6768),
  autoCards: z.boolean().default(true),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const preferences = defineSettings({ id: 'downloads', scope: 'host', version: 1, schema: preferencesSchema });

export const fileSchema = z.object({ path: z.string(), name: z.string(), size: z.number().nonnegative() });
export const cardSchema = z.object({ agentId: z.string(), files: z.array(fileSchema).max(12) });
export type DownloadFile = z.infer<typeof fileSchema>;
export type DownloadCardData = z.infer<typeof cardSchema>;
export const discoverySchema = z.object({
  candidates: z.array(z.string()).max(24), manualUrl: z.string(), generation: z.string(),
  probePath: z.string(), proof: z.string(), expiresAt: z.number(),
});
export type Discovery = z.infer<typeof discoverySchema>;
export const discoverDownloads = defineRpc({
  name: 'download.discover', input: z.object({}), output: discoverySchema,
});
export const prepareDownload = defineRpc({
  name: 'download.prepare',
  input: z.object({ agentId: z.string(), path: z.string().min(1).max(4096) }),
  output: z.object({ url: z.string(), downloadPath: z.string(), name: z.string(), expiresAt: z.number(), discovery: discoverySchema }),
});
export const collectDownloads = defineRpc({
  name: 'download.collect',
  input: z.object({ agentId: z.string(), path: z.string().min(1).max(4096).optional() }),
  output: z.object({ count: z.number() }),
});
export const downloadStatus = defineRpc({
  name: 'download.status', input: z.object({}),
  output: z.object({ listening: z.boolean(), port: z.number(), error: z.string().nullable() }),
});
