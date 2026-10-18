import { homedir } from 'node:os';
import { resolve } from 'node:path';

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface Template {
  id: string;
  label: string;
  /** Perintah scaffold, sebagai argv terpisah (tidak pernah string shell). */
  argv: string[] | null;
  devCommand: string;
}

/** Template bawaan; bisa ditimpa lewat file konfigurasi templates.json. */
export const defaultTemplates: Template[] = [
  { id: 'empty', label: 'Kosong', argv: null, devCommand: 'npm run dev' },
  {
    id: 'nextjs',
    label: 'Next.js',
    argv: ['npx', '--yes', 'create-next-app@latest', '.', '--yes'],
    devCommand: 'npm run dev',
  },
  {
    id: 'vite',
    label: 'Vite',
    argv: ['npm', 'create', 'vite@latest', '.', '--', '--template', 'react-ts'],
    devCommand: 'npm run dev',
  },
];

export const config = {
  /** Server hanya mendengarkan di loopback; akses luar lewat Tailscale/Cloudflare Access. */
  host: env('PANEL_HOST', '127.0.0.1'),
  port: envInt('PANEL_PORT', 4000),

  /** Folder induk tempat semua project dibuat. */
  projectsRoot: resolve(env('PANEL_PROJECTS_ROOT', `${homedir()}/projects`)),
  /** Berkas metadata project. */
  stateFile: resolve(env('PANEL_STATE_FILE', `${homedir()}/.claude-panel/projects.json`)),

  defaultDevCommand: env('PANEL_DEFAULT_DEV_COMMAND', 'npm run dev'),
  claudeCommand: env('PANEL_CLAUDE_COMMAND', 'claude'),

  portRangeStart: envInt('PANEL_PORT_RANGE_START', 3100),
  portRangeEnd: envInt('PANEL_PORT_RANGE_END', 3199),

  /** Hash password (argon2id atau bcrypt) hasil `npm run hash-password`. */
  passwordHash: env('PANEL_PASSWORD_HASH', ''),
  sessionSecret: env('PANEL_SESSION_SECRET', ''),
  sessionTtlMs: envInt('PANEL_SESSION_TTL_HOURS', 24 * 14) * 3600_000,
  /** Cookie Secure dimatikan hanya untuk pengembangan lokal via http. */
  insecureCookies: env('PANEL_INSECURE_COOKIES', '') === '1',
  /** Origin yang boleh membuka WebSocket; kosong berarti hanya same-origin. */
  allowedOrigins: env('PANEL_ALLOWED_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Batas unggah file manager. */
  maxUploadBytes: envInt('PANEL_MAX_UPLOAD_MB', 100) * 1024 * 1024,

  statusPollMs: envInt('PANEL_STATUS_POLL_MS', 4000),
  sessionPrefix: 'proj-',
} as const;

export const WINDOWS = ['claude', 'dev', 'shell'] as const;
export type WindowName = (typeof WINDOWS)[number];

export function isWindowName(v: string): v is WindowName {
  return (WINDOWS as readonly string[]).includes(v);
}

export const PROJECT_NAME_RE = /^[a-z0-9-]{1,40}$/;
