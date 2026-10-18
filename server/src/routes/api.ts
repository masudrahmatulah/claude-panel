import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { config, isWindowName } from '../config.js';
import {
  RateLimiter,
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import {
  HttpError,
  browseDirectories,
  createProject,
  deleteProject,
  detectDevCommand,
  importProject,
  ensureSession,
  getProject,
  listProjects,
  listTemplates,
  windowCommand,
} from '../services/projects.js';
import { TmuxService, sessionName } from '../services/tmux.js';
import { killProcess, listListeningProcesses } from '../services/processes.js';
import { getProjectStatus, statusPoller } from '../services/status.js';
import { registerFileRoutes } from './files.js';

const loginLimiter = new RateLimiter(8, 5 * 60_000);

export const api = new Hono();

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

api.post('/login', async (c) => {
  const ip = clientIp(c);
  if (!loginLimiter.check(ip)) {
    return c.json({ error: 'terlalu banyak percobaan, coba lagi nanti' }, 429);
  }

  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  if (!config.passwordHash) {
    return c.json({ error: 'PANEL_PASSWORD_HASH belum diset di server' }, 500);
  }
  if (!body.password || !(await verifyPassword(body.password, config.passwordHash))) {
    return c.json({ error: 'password salah' }, 401);
  }

  loginLimiter.reset(ip);
  setSessionCookie(c, createSessionToken());
  return c.json({ ok: true });
});

api.post('/logout', (c) => {
  clearSessionCookie(c);
  deleteCookie(c, 'panel_session');
  return c.json({ ok: true });
});

api.get('/session', (c) => c.json({ authenticated: isAuthenticated(c) }));

// Semua di bawah ini wajib login.
api.use('*', requireAuth);

api.get('/templates', async (c) => c.json({ templates: await listTemplates() }));

api.get('/projects', async (c) => {
  const projects = await listProjects();
  const cached = new Map(statusPoller.snapshot().map((s) => [s.id, s]));
  const withStatus = await Promise.all(
    projects.map(async (project) => ({
      ...project,
      status: cached.get(project.id) ?? (await getProjectStatus(project)),
    })),
  );
  return c.json({ projects: withStatus });
});

api.post('/projects', async (c) => {
  const body = await c.req.json<{ name?: string; template?: string; devCommand?: string }>();
  if (!body.name) throw new HttpError(400, 'nama project wajib diisi');
  const project = await createProject({
    name: body.name,
    template: body.template,
    devCommand: body.devCommand,
  });
  return c.json({ project }, 201);
});

/** Daftarkan folder yang sudah ada sebagai project. */
api.post('/projects/import', async (c) => {
  const body = await c.req.json<{
    path?: string;
    name?: string;
    devCommand?: string;
    port?: number;
  }>();
  if (!body.path) throw new HttpError(400, 'path folder wajib diisi');
  const project = await importProject({
    path: body.path,
    name: body.name,
    devCommand: body.devCommand,
    port: body.port,
  });
  return c.json({ project }, 201);
});

/** Pemilih folder untuk form impor. */
api.get('/browse', async (c) => c.json(await browseDirectories(c.req.query('path'))));

/** Tebakan perintah dev untuk folder yang sedang dipilih di form impor. */
api.get('/detect-dev-command', async (c) => {
  const path = c.req.query('path');
  if (!path) throw new HttpError(400, 'path wajib diisi');
  return c.json({ devCommand: await detectDevCommand(path) });
});

api.get('/projects/:id', async (c) => {
  const project = await getProject(c.req.param('id'));
  return c.json({ project, status: await getProjectStatus(project) });
});

api.delete('/projects/:id', async (c) => {
  const deleteFiles = c.req.query('deleteFiles') === '1';
  await deleteProject(c.req.param('id'), deleteFiles);
  return c.json({ ok: true });
});

api.post('/projects/:id/session', async (c) => {
  const project = await getProject(c.req.param('id'));
  await ensureSession(project);
  return c.json({ ok: true });
});

api.post('/projects/:id/windows/:win/stop', async (c) => {
  const { project, window } = await resolveWindow(c.req.param('id'), c.req.param('win'));
  await TmuxService.sendKey(sessionName(project.name), window, 'C-c');
  return c.json({ ok: true });
});

api.post('/projects/:id/windows/:win/restart', async (c) => {
  const { project, window } = await resolveWindow(c.req.param('id'), c.req.param('win'));
  const session = sessionName(project.name);
  await ensureSession(project);
  await TmuxService.sendKey(session, window, 'C-c');
  await new Promise((r) => setTimeout(r, 400));

  const command = windowCommand(project, window);
  if (command) await TmuxService.sendCommand(session, window, command);
  return c.json({ ok: true, command });
});

api.get('/processes', async (c) => c.json({ processes: await listListeningProcesses() }));

api.delete('/processes/:pid', async (c) => {
  const pid = Number.parseInt(c.req.param('pid'), 10);
  await killProcess(pid, c.req.query('force') === '1');
  return c.json({ ok: true });
});

registerFileRoutes(api);

async function resolveWindow(id: string, win: string) {
  if (!isWindowName(win)) throw new HttpError(400, 'nama jendela tidak dikenal');
  return { project: await getProject(id), window: win };
}
