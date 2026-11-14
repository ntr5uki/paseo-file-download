import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractFileLinks } from '../server/links';

const root = '/workspace';
test('recognizes local Markdown links and references, preserves Unicode, and deduplicates paths', () => {
  const markdown = '[installer](dist/setup.exe) [file](<dist/安装 包.exe>) [encoded](dist/安装%20包.exe) [zip][release]\n\n[release]: dist/release.zip';
  assert.deepEqual(extractFileLinks(markdown, root), ['/workspace/dist/setup.exe', '/workspace/dist/安装 包.exe', '/workspace/dist/release.zip']);
});
test('ignores images, external URLs, code examples, plain text, and unsafe schemes', () => {
  const markdown = '[web](https://example.com/a.exe) ![image](picture.png) [bad](javascript:alert) [mail](mailto:x@y.com) [anchor](#title) [scheme](custom:thing)\n\n    [example](not-real.exe)\n\nsetup.exe';
  assert.deepEqual(extractFileLinks(markdown, root), []);
});
test('handles absolute paths, nested parentheses, file URLs and source line fragments', () => {
  assert.deepEqual(extractFileLinks('[a](/workspace/setup(1).exe) [b](file:///workspace/a%20b.zip) [source](src/main.ts#L10)', root), ['/workspace/setup(1).exe', '/workspace/a b.zip', '/workspace/src/main.ts']);
});
