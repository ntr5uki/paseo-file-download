import { Platform } from 'react-native';
import { openExternalUrl } from '@getpaseo/plugin/client';

declare const document: {
  createElement(tag: string): { href: string; download: string; rel: string; click(): void; remove(): void };
  body: { appendChild(node: unknown): void };
};
export async function saveDownload(url: string, name: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = url; link.download = name; link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
    return;
  }
  await openExternalUrl(url);
}
