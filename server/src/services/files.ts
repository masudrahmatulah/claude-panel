import { createWriteStream } from 'node:fs';
import { mkdir, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { HttpError, type Project } from './projects.js';

export interface FileEntry {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  size: number;
  modifiedAt: string;
}

function isInside(root: string, candidate: string): boolean {
  if (candidate === root) return true;
  const rel = relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
}

/**
 * Selesaikan path relatif terhadap root project dengan realpath, lalu tolak
 * apa pun yang jatuh di luar root — ini menutup `../` sekaligus symlink yang
 * menunjuk keluar. Untuk path yang belum ada (upload, mkdir), induknya yang
 * diperiksa.
 */
export async function resolveInProject(
  project: Project,
  relPath: string,
  options: { mustExist?: boolean } = {},
): Promise<string> {
  const root = await realpath(project.path);
  const cleaned = relPath.replace(/^[/\\]+/, '');
  if (cleaned.split(/[/\\]/).includes('..')) throw new HttpError(400, 'path tidak valid');

  const target = resolve(root, cleaned);
  if (!isInside(root, target)) throw new HttpError(400, 'path di luar folder project');

  try {
    const real = await realpath(target);
    if (!isInside(root, real)) throw new HttpError(400, 'path di luar folder project');
    return real;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (options.mustExist) throw new HttpError(404, 'file atau folder tidak ditemukan');
    // Belum ada: pastikan folder induknya masih di dalam project.
    const parent = await realpath(dirname(target));
    if (!isInside(root, parent)) throw new HttpError(400, 'path di luar folder project');
    return join(parent, target.slice(target.lastIndexOf(sep) + 1));
  }
}

export async function toRelative(project: Project, absolute: string): Promise<string> {
  return relative(await realpath(project.path), absolute).split(sep).join('/');
}

export async function listDirectory(project: Project, relPath: string): Promise<FileEntry[]> {
  const dir = await resolveInProject(project, relPath, { mustExist: true });
  const entries = await readdir(dir, { withFileTypes: true });

  const result: FileEntry[] = [];
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(absolute);
    } catch {
      continue; // symlink menggantung
    }
    result.push({
      name: entry.name,
      path: await toRelative(project, absolute),
      kind: info.isDirectory() ? 'dir' : 'file',
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
    });
  }

  return result.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
  );
}

/** Buang komponen path dan karakter berbahaya dari nama berkas unggahan. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f]/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new HttpError(400, 'nama file tidak valid');
  return cleaned;
}

export async function saveUpload(
  project: Project,
  relDir: string,
  fileName: string,
  stream: Readable,
  options: { overwrite: boolean; maxBytes: number },
): Promise<string> {
  const dir = await resolveInProject(project, relDir, { mustExist: true });
  const safeName = sanitizeFileName(fileName);
  const target = await resolveInProject(project, join(await toRelative(project, dir), safeName));

  if (!options.overwrite && (await exists(target))) {
    throw new HttpError(409, `file ${safeName} sudah ada`);
  }

  let written = 0;
  stream.on('data', (chunk: Buffer) => {
    written += chunk.length;
    if (written > options.maxBytes) stream.destroy(new HttpError(413, 'file melebihi batas ukuran'));
  });

  // mode 0o644: berkas unggahan tidak pernah diberi izin eksekusi.
  await pipeline(stream, createWriteStream(target, { mode: 0o644 }));
  return toRelative(project, target);
}

export async function makeDirectory(project: Project, relPath: string): Promise<string> {
  const target = await resolveInProject(project, relPath);
  await mkdir(target, { recursive: true });
  return toRelative(project, target);
}

export async function movePath(project: Project, from: string, to: string): Promise<string> {
  const source = await resolveInProject(project, from, { mustExist: true });
  const destination = await resolveInProject(project, to);
  if (source === (await realpath(project.path))) throw new HttpError(400, 'menolak memindahkan root project');
  if (await exists(destination)) throw new HttpError(409, 'tujuan sudah ada');
  await rename(source, destination);
  return toRelative(project, destination);
}

export async function removePath(project: Project, relPath: string): Promise<void> {
  const target = await resolveInProject(project, relPath, { mustExist: true });
  if (target === (await realpath(project.path))) throw new HttpError(400, 'menolak menghapus root project');
  await rm(target, { recursive: true, force: true });
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
