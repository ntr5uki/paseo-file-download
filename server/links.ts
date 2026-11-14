import { fromMarkdown } from 'mdast-util-from-markdown';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

interface Node { type: string; url?: string; identifier?: string; children?: Node[] }
export function extractFileLinks(markdown: string, cwd: string): string[] {
  const tree = fromMarkdown(markdown.slice(0, 2_000_000)) as Node;
  const definitions = new Map<string, string>();
  const visit = (node: Node, action: (node: Node) => void) => {
    action(node);
    for (const child of node.children ?? []) visit(child, action);
  };
  visit(tree, (node) => {
    if (node.type === 'definition' && node.identifier && node.url) definitions.set(node.identifier.toLowerCase(), node.url);
  });
  const paths = new Set<string>();
  visit(tree, (node) => {
    const href = node.type === 'link' ? node.url : node.type === 'linkReference' ? definitions.get((node.identifier ?? '').toLowerCase()) : undefined;
    if (!href || href.length > 4096 || paths.size >= 48) return;
    if (/^(?:https?:|mailto:|data:|javascript:|#|\/\/)/i.test(href)) return;
    try {
      let path: string;
      if (/^file:/i.test(href)) {
        const url = new URL(href); url.hash = ''; path = fileURLToPath(url);
      } else {
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return;
        path = decodeURIComponent(href.replace(/#[^#]*$/, ''));
      }
      if (path && !path.includes('\0')) paths.add(resolve(cwd, path));
    } catch { /* Malformed or non-local URLs are ordinary links. */ }
  });
  return [...paths];
}
