import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config, type WindowName } from '../config.js';

const run = promisify(execFile);

export interface TmuxWindow {
  index: number;
  name: string;
  active: boolean;
  /** Perintah yang sedang berjalan di pane aktif jendela ini. */
  currentCommand: string;
}

export function sessionName(projectName: string): string {
  return `${config.sessionPrefix}${projectName}`;
}

/**
 * Semua pemanggilan tmux lewat execFile dengan argumen terpisah; tidak pernah
 * menyusun string shell dari input pengguna.
 */
async function tmux(args: string[]): Promise<string> {
  const { stdout } = await run('tmux', args, { maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

async function tmuxOk(args: string[]): Promise<boolean> {
  try {
    await tmux(args);
    return true;
  } catch {
    return false;
  }
}

export const TmuxService = {
  async hasSession(session: string): Promise<boolean> {
    return tmuxOk(['has-session', '-t', `=${session}`]);
  },

  async listSessions(): Promise<string[]> {
    try {
      const out = await tmux(['list-sessions', '-F', '#{session_name}']);
      return out.split('\n').filter(Boolean);
    } catch {
      return []; // tidak ada server tmux yang berjalan
    }
  },

  /** Buat session dengan jendela pertama; idempoten. */
  async createSession(session: string, cwd: string, firstWindow: string): Promise<void> {
    if (await this.hasSession(session)) return;
    await tmux(['new-session', '-d', '-s', session, '-n', firstWindow, '-c', cwd]);
  },

  async createWindow(session: string, name: string, cwd: string): Promise<void> {
    await tmux(['new-window', '-d', '-t', `=${session}`, '-n', name, '-c', cwd]);
  },

  async killSession(session: string): Promise<void> {
    await tmuxOk(['kill-session', '-t', `=${session}`]);
  },

  async listWindows(session: string): Promise<TmuxWindow[]> {
    try {
      const out = await tmux([
        'list-windows',
        '-t',
        `=${session}`,
        '-F',
        '#{window_index}\t#{window_name}\t#{window_active}\t#{pane_current_command}',
      ]);
      return out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [index, name, active, currentCommand] = line.split('\t');
          return {
            index: Number.parseInt(index ?? '0', 10),
            name: name ?? '',
            active: active === '1',
            currentCommand: currentCommand ?? '',
          };
        });
    } catch {
      return [];
    }
  },

  async hasWindow(session: string, window: string): Promise<boolean> {
    return (await this.listWindows(session)).some((w) => w.name === window);
  },

  /**
   * Tunggu sampai shell di jendela siap menerima ketikan. Tanpa ini, perintah
   * yang dikirim tepat setelah jendela dibuat bisa hilang ditelan shell yang
   * belum selesai memuat profil.
   */
  async waitForShell(session: string, window: string, timeoutMs = 3000): Promise<boolean> {
    const shells = new Set(['bash', 'zsh', 'sh', 'fish']);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pane = (await this.listWindows(session)).find((w) => w.name === window);
      if (pane && shells.has(pane.currentCommand)) {
        await new Promise((r) => setTimeout(r, 150));
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  },

  /** Kirim teks lalu Enter — untuk menjalankan perintah di jendela. */
  async sendCommand(session: string, window: string, command: string): Promise<void> {
    await tmux(['send-keys', '-t', target(session, window), command, 'Enter']);
  },

  /** Kirim satu tombol kendali, misalnya C-c. */
  async sendKey(session: string, window: string, key: string): Promise<void> {
    await tmux(['send-keys', '-t', target(session, window), key]);
  },

  /** Ambil isi layar jendela, untuk heuristik status. */
  async capturePane(session: string, window: string, lines = 40): Promise<string> {
    try {
      return await tmux(['capture-pane', '-p', '-t', target(session, window), '-S', `-${lines}`]);
    } catch {
      return '';
    }
  },

  /** PID proses terdepan di pane jendela. */
  async panePid(session: string, window: string): Promise<number | null> {
    try {
      const out = await tmux([
        'list-panes',
        '-t',
        target(session, window),
        '-F',
        '#{pane_pid}',
      ]);
      const pid = Number.parseInt(out.split('\n')[0] ?? '', 10);
      return Number.isFinite(pid) ? pid : null;
    } catch {
      return null;
    }
  },

  /** Perintah untuk attach ke satu jendela, dipakai TerminalGateway. */
  attachArgs(session: string, window: WindowName | string): string[] {
    return ['attach-session', '-t', target(session, window)];
  },
};

function target(session: string, window: string): string {
  return `=${session}:${window}`;
}
