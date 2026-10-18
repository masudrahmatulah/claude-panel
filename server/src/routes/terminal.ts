import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import pty from 'node-pty';
import { COOKIE_NAME, isAllowedOrigin, verifySessionToken } from '../auth.js';
import { isWindowName } from '../config.js';
import { TmuxService, sessionName } from '../services/tmux.js';
import { ensureSession, getProject } from '../services/projects.js';

const PATH_RE = /^\/ws\/terminal\/([a-z0-9-]{1,40})\/(claude|dev|shell)$/;

interface ClientMessage {
  type: 'input' | 'resize';
  data?: string;
  cols?: number;
  rows?: number;
}

/**
 * Menyambungkan browser ke jendela tmux lewat node-pty. Karena proses hidup di
 * tmux, menutup tab atau me-restart server tidak mematikan Claude maupun dev
 * server; klien tinggal attach ulang.
 */
export function attachTerminalGateway(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = PATH_RE.exec(url.pathname);
    if (!match) return; // bukan endpoint kami; biarkan handler lain

    if (!isAllowedOrigin(request.headers.origin, request.headers.host)) {
      return reject(socket, 403, 'origin tidak diizinkan');
    }
    if (!verifySessionToken(readCookie(request.headers.cookie, COOKIE_NAME))) {
      return reject(socket, 401, 'unauthorized');
    }

    const [, projectId, window] = match;
    if (!projectId || !window || !isWindowName(window)) return reject(socket, 400, 'bad request');

    wss.handleUpgrade(request, socket, head, (ws) => {
      void startSession(ws, projectId, window).catch((error: unknown) => {
        ws.send(`\r\n\x1b[31m${(error as Error).message}\x1b[0m\r\n`);
        ws.close();
      });
    });
  });
}

async function startSession(ws: WebSocket, projectId: string, window: string): Promise<void> {
  const project = await getProject(projectId);
  await ensureSession(project);
  const session = sessionName(project.name);
  if (!(await TmuxService.hasWindow(session, window))) {
    throw new Error(`jendela ${window} tidak ditemukan`);
  }

  const term = pty.spawn('tmux', TmuxService.attachArgs(session, window), {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: project.path,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  term.onExit(() => ws.close());

  ws.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (message.type === 'input' && typeof message.data === 'string') {
      term.write(message.data);
    } else if (message.type === 'resize' && message.cols && message.rows) {
      // batas wajar agar tmux tidak diberi ukuran tidak masuk akal
      term.resize(clamp(message.cols, 20, 500), clamp(message.rows, 5, 200));
    }
  });

  // Menutup klien hanya melepas attach; session tmux tetap hidup.
  ws.on('close', () => term.kill());
  ws.on('error', () => term.kill());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function reject(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
