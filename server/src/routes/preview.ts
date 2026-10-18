import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import { getProject } from '../services/projects.js';

export const preview = new Hono();

preview.use('*', requireAuth);

/**
 * Reverse proxy ke dev server project: /preview/:id/<path> -> 127.0.0.1:<port>/<path>.
 * Beberapa framework bermasalah dengan sub-path; base URL dapat diatur di
 * konfigurasi dev server project (misalnya `--base=/preview/<id>/`).
 */
preview.all('/:id/*', async (c) => {
  const project = await getProject(c.req.param('id'));
  const prefix = `/preview/${project.id}`;
  const url = new URL(c.req.url);
  const upstream = new URL(
    url.pathname.slice(prefix.length) || '/',
    `http://127.0.0.1:${project.port}`,
  );
  upstream.search = url.search;

  const headers = new Headers(c.req.raw.headers);
  headers.delete('host');
  headers.delete('accept-encoding');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  headers.set('x-forwarded-prefix', prefix);

  let response: Response;
  try {
    response = await fetch(upstream, {
      method: c.req.method,
      headers,
      body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : c.req.raw.body,
      redirect: 'manual',
      // duplex diperlukan Node saat body berupa stream
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  } catch {
    return c.text(`Dev server project ${project.id} tidak merespons di port ${project.port}.`, 502);
  }

  const out = new Headers(response.headers);
  out.delete('content-encoding');
  out.delete('content-length');

  // Jaga agar redirect tetap berada di dalam prefix preview.
  const location = out.get('location');
  if (location?.startsWith('/')) out.set('location', `${prefix}${location}`);

  return new Response(response.body, { status: response.status, headers: out });
});

preview.all('/:id', (c) => c.redirect(`/preview/${c.req.param('id')}/`));
