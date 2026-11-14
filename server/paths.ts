import { constants } from 'node:fs';
import { open, realpath, stat, type FileHandle } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

export interface FileStamp { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }
export function sameFile(a: FileStamp, b: FileStamp): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}
function visible(path: string): boolean {
  return !path.split(/[\\/]/).some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..');
}
export interface OpenedFile { handle: FileHandle; stamp: FileStamp; path: string; root: string; name: string }
export async function openWorkspaceFile(workspaceRoot: string, requested: string): Promise<OpenedFile> {
  if (requested.includes('\0')) throw new Error('Invalid file path.');
  const lexicalRoot = resolve(workspaceRoot);
  const root = await realpath(lexicalRoot);
  const candidate = resolve(lexicalRoot, requested);
  const candidateRoot = inside(lexicalRoot, candidate) ? lexicalRoot : root;
  if (!inside(candidateRoot, candidate)) throw new Error('The file is outside the workspace.');
  if (!visible(relative(candidateRoot, candidate))) throw new Error('Hidden files and folders cannot be downloaded.');
  const path = await realpath(candidate);
  if (!inside(root, path) || !visible(relative(root, path))) throw new Error('The file is outside the allowed workspace paths.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Choose a regular file, not a folder.');
    const currentPath = await realpath(candidate);
    const current = await stat(currentPath);
    if (!inside(root, currentPath) || !visible(relative(root, currentPath)) || info.dev !== current.dev || info.ino !== current.ino) throw new Error('The file changed. Try again.');
    return { handle, path, root, name: basename(path), stamp: { dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs } };
  } catch (error) { await handle.close(); throw error; }
}
