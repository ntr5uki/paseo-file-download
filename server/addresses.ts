import { hostname, networkInterfaces } from 'node:os';

type Interfaces = Record<string, readonly { family: string; address: string; internal: boolean }[] | undefined>;
export function candidateUrls(listenHost: string, port: number, interfaces: Interfaces = networkInterfaces(), hostName = hostname()): string[] {
  if (listenHost === '127.0.0.1') return ['http://127.0.0.1:' + port];
  const addresses = ['127.0.0.1'];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (/^(docker|br-|veth|virbr)/i.test(name)) continue;
    for (const entry of entries ?? []) {
      // The plugin's IPv4 listener cannot serve IPv6 candidates.
      if (entry.family === 'IPv4' && !entry.internal && entry.address !== '0.0.0.0') addresses.push(entry.address);
    }
  }
  if (hostName && /^[a-z0-9_.-]+$/i.test(hostName)) {
    addresses.push(hostName);
    if (!hostName.includes('.')) addresses.push(hostName + '.local');
  }
  return [...new Set(addresses)].slice(0, 24).map((address) => 'http://' + address + ':' + port);
}
