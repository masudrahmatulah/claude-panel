import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import type { Hono } from 'hono';
import archiver from 'archiver';
import { config } from '../config.js';
import { HttpError, getProject } from '../services/projects.js';
import {
  listDirectory,
  makeDirectory,
  movePath,
  removePath,
  resolveInProject,
  saveUpload,
  toRelative,
} from '../services/files.js';

/** Endpoint file manager; dipasang di bawah /api/projects/:id/files. */
export function registerFileRoutes(app: Hono): void {
  app.get('/projects/:id/files', async (c) => {
    const project = await getProject(c.req.param('id'));
    const path = c.req.query('path') ?? '';
    const entries = await listDirectory(project, path);
    return c.json({ path: path.replace(/^\/+/, ''), entries });
  });

  app.post('/projects/:id/files', async (c) => {
    const project = await getProject(c.req.param('id'));
    const dir = c.req.query('path') ?? '';
    const overwrite = c.req.query('overwrite') === '1';

    const form = await c.req.formData();
    const uploads = (form.getAll('files') as unknown[]).filter(isUploadedFile);
    if (uploads.length === 0) throw new HttpError(400, 'tidak ada file yang diunggah');

    const saved: string[] = [];
    for (const file of uploads) {
      if (file.size > config.maxUploadBytes) {
        throw new HttpError(413, `${file.name} melebihi batas ${config.maxUploadBytes} byte`);
      }
      // Stream ke disk, jangan tahan seluruh berkas di memori.
      const stream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
      saved.push(
        await saveUpload(project, dir, file.name, stream, {
          overwrite,
          maxBytes: config.maxUploadBytes,
        }),
      );
    }
    return c.json({ ok: true, saved }, 201);
  });

  app.get('/projects/:id/files/download', async (c) => {
    const project = await getProject(c.req.param('id'));
    const relPath = c.req.query('path') ?? '';
    const target = await resolveInProject(project, relPath, { mustExist: true });
    const info = await stat(target);
    const name = basename(target) || project.name;

    if (info.isDirectory()) {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.directory(target, false);
      void archive.finalize();
      return new Response(Readable.toWeb(archive) as ReadableStream, {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': contentDisposition(`${name}.zip`),
        },
      });
    }

    return new Response(Readable.toWeb(createReadStream(target)) as ReadableStream, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(info.size),
        'content-disposition': contentDisposition(name),
      },
    });
  });

  app.post('/projects/:id/files/mkdir', async (c) => {
    const project = await getProject(c.req.param('id'));
    const body = await c.req.json<{ path?: string }>();
    if (!body.path) throw new HttpError(400, 'path wajib diisi');
    return c.json({ ok: true, path: await makeDirectory(project, body.path) }, 201);
  });

  app.patch('/projects/:id/files', async (c) => {
    const project = await getProject(c.req.param('id'));
    const body = await c.req.json<{ from?: string; to?: string }>();
    if (!body.from || !body.to) throw new HttpError(400, 'from dan to wajib diisi');
    return c.json({ ok: true, path: await movePath(project, body.from, body.to) });
  });

  app.delete('/projects/:id/files', async (c) => {
    const project = await getProject(c.req.param('id'));
    const path = c.req.query('path');
    if (!path) throw new HttpError(400, 'path wajib diisi');
    await removePath(project, path);
    return c.json({ ok: true });
  });

  // dipakai UI untuk menampilkan path relatif setelah navigasi
  app.get('/projects/:id/files/resolve', async (c) => {
    const project = await getProject(c.req.param('id'));
    const target = await resolveInProject(project, c.req.query('path') ?? '', { mustExist: true });
    return c.json({ path: await toRelative(project, target) });
  });
}

interface UploadedFile {
  name: string;
  size: number;
  stream(): unknown;
}

/** FormData bisa berisi string; ambil hanya entri yang berupa berkas. */
function isUploadedFile(value: unknown): value is UploadedFile {
  return typeof value === 'object' && value !== null && 'stream' in value && 'name' in value;
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
