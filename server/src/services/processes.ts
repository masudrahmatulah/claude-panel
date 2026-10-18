import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HttpError } from './projects.js';

const run = promisify(execFile);

export interface ListeningProcess {
  pid: number;
  port: number;
  address: string;
  command: string;
  /** true bila proses dimiliki user yang menjalankan server. */
  ownedByUs: boolean;
}

/** Daftar proses yang listen di port TCP, via `ss -tlnp`. */
export async function listListeningProcesses(): Promise<ListeningProcess[]> {
  let stdout = '';
  try {
    ({ stdout } = await run('ss', ['-tlnpH'], { maxBuffer: 2 * 1024 * 1024 }));
  } catch {
    return [];
  }

  const found = new Map<string, ListeningProcess>();
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const columns = line.trim().split(/\s+/);
    const local = columns[3];
    if (!local) continue;
    const port = Number.parseInt(local.slice(local.lastIndexOf(':') + 1), 10);
    if (!Number.isFinite(port)) continue;

    // users:(("node",pid=1234,fd=23))
    const match = /users:\(\("([^"]+)",pid=(\d+)/.exec(line);
    if (!match) continue;
    const pid = Number.parseInt(match[2] ?? '', 10);
    if (!Number.isFinite(pid)) continue;

    const key = `${pid}:${port}`;
    if (found.has(key)) continue;
    found.set(key, {
      pid,
      port,
      address: local,
      command: await commandLine(pid, match[1] ?? ''),
      ownedByUs: await isOurProcess(pid),
    });
  }

  return [...found.values()].sort((a, b) => a.port - b.port);
}

async function commandLine(pid: number, fallback: string): Promise<string> {
  try {
    const { stdout } = await run('ps', ['-p', String(pid), '-o', 'args=']);
    return stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function isOurProcess(pid: number): Promise<boolean> {
  try {
    const { stdout } = await run('ps', ['-p', String(pid), '-o', 'uid=']);
    return Number.parseInt(stdout.trim(), 10) === process.getuid?.();
  } catch {
    return false;
  }
}

/** Kill hanya diizinkan untuk proses milik user yang sama dengan server. */
export async function killProcess(pid: number, force: boolean): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 1) throw new HttpError(400, 'pid tidak valid');
  if (pid === process.pid) throw new HttpError(400, 'menolak mematikan server panel sendiri');
  if (!(await isOurProcess(pid))) {
    throw new HttpError(403, 'proses bukan milik user yang menjalankan panel');
  }
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch (error) {
    throw new HttpError(500, `gagal mengirim sinyal: ${(error as Error).message}`);
  }
}
