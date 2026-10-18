import { connect } from 'node:net';
import { TmuxService, sessionName } from './tmux.js';
import { listProjects, type Project } from './projects.js';
import { config } from '../config.js';

export type ClaudeStatus = 'running' | 'waiting' | 'idle' | 'off';
export type DevStatus = 'up' | 'starting' | 'off';

export interface ProjectStatus {
  id: string;
  sessionAlive: boolean;
  claude: ClaudeStatus;
  dev: DevStatus;
  port: number;
  updatedAt: number;
}

/**
 * Heuristik "Claude menunggu input" dibaca dari isi pane. Formatnya bisa
 * berubah sewaktu-waktu, jadi logika ini sengaja dipisah agar mudah diganti
 * dan statusnya tidak pernah diperlakukan sebagai kepastian.
 */
export function detectClaudeStatus(pane: string, paneCommand: string): ClaudeStatus {
  if (!paneCommand) return 'off';
  const isClaude = /claude|node/i.test(paneCommand);
  if (!isClaude) return 'off';

  const tail = pane.trimEnd().split('\n').slice(-16).join('\n');

  // Spinner atau hint interupsi: Claude sedang bekerja.
  if (/esc to interrupt|[\u280b\u2819\u2839\u2838\u283c\u2834\u2826\u2827\u2807\u280f]/i.test(tail)) {
    return 'running';
  }
  // Prompt izin atau pilihan: Claude menunggu jawaban pengguna.
  if (/\b(y\/n|yes\/no)\b/i.test(tail)) return 'waiting';
  if (/enter to confirm|esc to cancel|do you want|\u276f\s*(\d\.|yes|no)/i.test(tail)) return 'waiting';

  return 'idle';
}

async function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port, timeout: 400 });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

export async function getProjectStatus(project: Project): Promise<ProjectStatus> {
  const session = sessionName(project.name);
  const windows = await TmuxService.listWindows(session);
  const sessionAlive = windows.length > 0;

  let claude: ClaudeStatus = 'off';
  if (sessionAlive) {
    const claudeWindow = windows.find((w) => w.name === 'claude');
    if (claudeWindow) {
      const pane = await TmuxService.capturePane(session, 'claude');
      claude = detectClaudeStatus(pane, claudeWindow.currentCommand);
    }
  }

  let dev: DevStatus = 'off';
  if (sessionAlive) {
    const devWindow = windows.find((w) => w.name === 'dev');
    const devBusy = Boolean(devWindow && !isShell(devWindow.currentCommand));
    if (await portOpen(project.port)) dev = 'up';
    else if (devBusy) dev = 'starting';
  }

  return { id: project.id, sessionAlive, claude, dev, port: project.port, updatedAt: Date.now() };
}

function isShell(command: string): boolean {
  return ['bash', 'zsh', 'sh', 'fish', 'tmux'].includes(command);
}

/** Polling status semua project; hasilnya dibagikan ke semua klien. */
export class StatusPoller {
  private statuses = new Map<string, ProjectStatus>();
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<(statuses: ProjectStatus[]) => void>();

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), config.statusPollMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(): ProjectStatus[] {
    return [...this.statuses.values()];
  }

  subscribe(listener: (statuses: ProjectStatus[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async tick(): Promise<void> {
    try {
      const projects = await listProjects();
      const statuses = await Promise.all(projects.map((p) => getProjectStatus(p)));
      this.statuses = new Map(statuses.map((s) => [s.id, s]));
      for (const listener of this.listeners) listener(statuses);
    } catch {
      // jangan hentikan poller karena satu siklus gagal
    }
  }
}

export const statusPoller = new StatusPoller();
