export function endpointUrl(base: string, path: string): string {
  const url = new URL(base);
  url.pathname = url.pathname.replace(/\/+$/, '') + path;
  url.hash = ''; url.search = '';
  return url.toString();
}
