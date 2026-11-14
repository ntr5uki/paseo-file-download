import type { Discovery } from '../shared/contracts';
import { endpointUrl } from '../shared/urls';

export class DiscoveryError extends Error {
  constructor() { super('No verified download address is reachable from this device.'); this.name = 'DiscoveryError'; }
}
export type Probe = (base: string, discovery: Discovery, signal?: AbortSignal) => Promise<boolean>;
export async function probeEndpoint(base: string, discovery: Discovery, signal?: AbortSignal, timeoutMs = 1800): Promise<boolean> {
  if (signal?.aborted) return false;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(endpointUrl(base, discovery.probePath), {
      signal: controller.signal, credentials: 'omit',
    });
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 1024) return false;
    const value: unknown = await response.json();
    return !!value && typeof value === 'object' && 'proof' in value && value.proof === discovery.proof;
  } catch { return false; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
function canceled(): Error { const error = new Error('Download canceled.'); error.name = 'AbortError'; return error; }

export class EndpointResolver {
  private selected = new Map<string, { base: string; generation: string }>();
  constructor(private readonly probe: Probe = probeEndpoint) {}
  async resolve(hostId: string, discovery: Discovery, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw canceled();
    if (discovery.manualUrl) return discovery.manualUrl;
    const candidates = [...new Set(discovery.candidates)];
    const cached = this.selected.get(hostId);
    if (cached?.generation === discovery.generation && candidates.includes(cached.base)) {
      if (await this.probe(cached.base, discovery, signal)) return cached.base;
      candidates.splice(candidates.indexOf(cached.base), 1);
    }
    this.selected.delete(hostId);
    if (signal?.aborted) throw canceled();
    if (!candidates.length) throw new DiscoveryError();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const base = await Promise.any(candidates.map(async (candidate) => {
        if (await this.probe(candidate, discovery, controller.signal)) return candidate;
        throw new DiscoveryError();
      }));
      if (signal?.aborted) throw canceled();
      if (this.selected.size >= 32) this.selected.delete(this.selected.keys().next().value!);
      this.selected.set(hostId, { base, generation: discovery.generation });
      return base;
    } catch {
      if (signal?.aborted) throw canceled();
      throw new DiscoveryError();
    } finally { controller.abort(); signal?.removeEventListener('abort', cancel); }
  }
}
// Each app runtime owns its cache; nothing is saved to shared daemon settings.
export const endpoints = new EndpointResolver();
