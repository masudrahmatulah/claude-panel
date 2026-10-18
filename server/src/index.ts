import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { checkOrigin } from './auth.js';
import { config } from './config.js';
import { api } from './routes/api.js';
import { preview } from './routes/preview.js';
import { attachTerminalGateway } from './routes/terminal.js';
import { HttpError } from './services/projects.js';
import { statusPoller } from './services/status.js';

const here = dirname(fileURLToPath(import.meta.url));
const webDist = join(here, '..', '..', 'web', 'dist');

function requireSecrets(): void {
  const missing: string[] = [];
  if (!config.passwordHash) missing.push('PANEL_PASSWORD_HASH');
  if (!config.sessionSecret) missing.push('PANEL_SESSION_SECRET');
  if (missing.length > 0) {
    console.error(
      `Konfigurasi belum lengkap: ${missing.join(', ')}.\n` +
        'Buat hash password dengan: npm run hash-password --workspace=server',
    );
    process.exit(1);
  }
}

const app = new Hono();

app.use('*', checkOrigin);

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400);
  console.error(error);
  return c.json({ error: 'kesalahan server' }, 500);
});

app.route('/api', api);
app.route('/preview', preview);
app.get('/healthz', (c) => c.json({ ok: true }));

// UI hasil build dilayani dari server yang sama; saat pengembangan dipakai Vite.
if (existsSync(webDist)) {
  // serveStatic menyelesaikan root terhadap cwd proses, bukan lokasi modul.
  const root = `./${relative(process.cwd(), webDist) || '.'}`;
  app.use('/assets/*', serveStatic({ root }));
  app.get('*', serveStatic({ root, path: 'index.html' }));
}

/** Buat folder yang dibutuhkan, dengan pesan yang bisa ditindaklanjuti. */
async function ensureDirectory(path: string, setting: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    console.error(
      `Tidak bisa membuat folder ${path} (${setting}): ${code ?? 'gagal'}.\n` +
        'Periksa nilai itu di .env — apakah masih berisi contoh seperti /home/USER, ' +
        'atau menunjuk ke lokasi yang tidak bisa ditulis user ini?',
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  requireSecrets();
  await ensureDirectory(config.projectsRoot, 'PANEL_PROJECTS_ROOT');
  await ensureDirectory(dirname(config.stateFile), 'PANEL_STATE_FILE');

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    console.log(`claude-panel berjalan di http://${config.host}:${info.port}`);
    console.log(`Folder project: ${config.projectsRoot}`);
  });

  attachTerminalGateway(server as unknown as import('node:http').Server);
  statusPoller.start();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      statusPoller.stop();
      server.close(() => process.exit(0));
    });
  }
}

void main();
