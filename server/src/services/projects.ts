import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  PROJECT_NAME_RE,
  WINDOWS,
  config,
  defaultTemplates,
  type Template,
} from '../config.js';
import { TmuxService, sessionName } from './tmux.js';

const run = promisify(execFile);

export interface Project {
  id: string;
  name: string;
  path: string;
  devCommand: string;
  port: number;
  template?: string;
  createdAt?: string;
  /**
   * true bila folder dibuat oleh panel. Project hasil impor (folder yang sudah
   * ada sebelumnya) bernilai false, dan foldernya tidak pernah ikut terhapus.
   */
  managed?: boolean;
}

interface State {
  projects: Project[];
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let cache: State | null = null;
/** Serialisasi penulisan state agar dua permintaan tidak saling menimpa. */
let writeChain: Promise<unknown> = Promise.resolve();

async function readState(): Promise<State> {
  if (cache) return cache;
  try {
    const raw = await readFile(config.stateFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<State>;
    cache = { projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    cache = { projects: [] };
  }
  return cache;
}

async function writeState(state: State): Promise<void> {
  cache = state;
  writeChain = writeChain.then(async () => {
    await mkdir(dirname(config.stateFile), { recursive: true });
    const tmp = `${config.stateFile}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(tmp, config.stateFile); // tulis atomik
  });
  await writeChain;
}

export async function listProjects(): Promise<Project[]> {
  return (await readState()).projects;
}

export async function getProject(id: string): Promise<Project> {
  const project = (await readState()).projects.find((p) => p.id === id);
  if (!project) throw new HttpError(404, 'project tidak ditemukan');
  return project;
}

export async function listTemplates(): Promise<Template[]> {
  try {
    const raw = await readFile(join(dirname(config.stateFile), 'templates.json'), 'utf8');
    const parsed = JSON.parse(raw) as Template[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // tidak ada override; pakai bawaan
  }
  return defaultTemplates;
}

async function allocatePort(projects: Project[]): Promise<number> {
  const used = new Set(projects.map((p) => p.port));
  for (let port = config.portRangeStart; port <= config.portRangeEnd; port += 1) {
    if (!used.has(port)) return port;
  }
  throw new HttpError(409, 'rentang port habis');
}

export interface CreateProjectInput {
  name: string;
  template?: string;
  devCommand?: string;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const name = input.name.trim();
  if (!PROJECT_NAME_RE.test(name)) {
    throw new HttpError(400, 'nama hanya boleh a-z, 0-9, dan tanda hubung (maks 40)');
  }

  const state = await readState();
  if (state.projects.some((p) => p.id === name)) {
    throw new HttpError(409, 'project dengan nama itu sudah ada');
  }

  const templates = await listTemplates();
  const template = templates.find((t) => t.id === (input.template ?? 'empty'));
  if (!template) throw new HttpError(400, 'template tidak dikenal');

  // Path selalu disusun dari nama yang sudah tervalidasi, di bawah projectsRoot.
  const path = resolve(config.projectsRoot, name);
  if (!path.startsWith(`${config.projectsRoot}/`)) {
    throw new HttpError(400, 'path project tidak valid');
  }

  await mkdir(path, { recursive: true });
  try {
    await run('git', ['init', '-q'], { cwd: path });
  } catch {
    // git opsional; jangan gagalkan pembuatan project
  }

  const project: Project = {
    id: name,
    name,
    path,
    devCommand: input.devCommand?.trim() || template.devCommand || config.defaultDevCommand,
    port: await allocatePort(state.projects),
    template: template.id,
    createdAt: new Date().toISOString(),
    managed: true,
  };

  await writeState({ projects: [...state.projects, project] });
  await ensureSession(project);

  // Scaffold dijalankan di jendela shell agar progresnya terlihat di terminal web.
  if (template.argv && template.argv.length > 0) {
    await TmuxService.waitForShell(sessionName(project.name), 'shell');
    await TmuxService.sendCommand(
      sessionName(project.name),
      'shell',
      template.argv.map(shellQuote).join(' '),
    );
  }

  return project;
}

export async function deleteProject(id: string, deleteFiles: boolean): Promise<void> {
  const state = await readState();
  const project = state.projects.find((p) => p.id === id);
  if (!project) throw new HttpError(404, 'project tidak ditemukan');

  // Semua pemeriksaan dijalankan lebih dulu: jangan sampai pendaftaran sudah
  // dicabut lalu permintaan ditolak di tengah jalan.
  const path = resolve(project.path);
  if (deleteFiles) {
    // Folder yang hanya didaftarkan (impor) tidak pernah dihapus oleh panel.
    if (project.managed === false) {
      throw new HttpError(400, 'project ini hasil impor; folder aslinya tidak dihapus panel');
    }
    if (!path.startsWith(`${config.projectsRoot}/`)) {
      throw new HttpError(400, 'menolak menghapus folder di luar projectsRoot');
    }
  }

  await TmuxService.killSession(sessionName(project.name));
  await writeState({ projects: state.projects.filter((p) => p.id !== id) });

  if (deleteFiles) await rm(path, { recursive: true, force: true });
}

/** Pastikan session dan ketiga jendela ada; aman dipanggil berulang. */
export async function ensureSession(project: Project): Promise<void> {
  const session = sessionName(project.name);
  await mkdir(project.path, { recursive: true });

  // Dibaca sebelum apa pun dibuat, agar jendela lama tidak ikut di-restart.
  const existing = new Set((await TmuxService.listWindows(session)).map((w) => w.name));

  const sessionExisted = await TmuxService.hasSession(session);
  await TmuxService.createSession(session, project.path, WINDOWS[0]);
  for (const window of WINDOWS) {
    // Jendela pertama sudah ikut terbuat bersama session baru.
    if (existing.has(window) || (!sessionExisted && window === WINDOWS[0])) continue;
    await TmuxService.createWindow(session, window, project.path);
  }

  // Jalankan Claude hanya di jendela yang baru saja dibuat.
  if (!existing.has('claude')) {
    await TmuxService.waitForShell(session, 'claude');
    await TmuxService.sendCommand(session, 'claude', config.claudeCommand);
  }
}

export function windowCommand(project: Project, window: string): string | null {
  if (window === 'claude') return config.claudeCommand;
  if (window === 'dev') return withPort(project.devCommand, project.port);
  return null; // shell dibiarkan kosong
}

/** Sisipkan PORT agar dev server tiap project tidak bentrok. */
function withPort(devCommand: string, port: number): string {
  return `PORT=${port} ${devCommand}`;
}

function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** Ubah nama folder menjadi id yang sah: huruf kecil, angka, tanda hubung. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function uniqueId(base: string, taken: Set<string>): Promise<string> {
  const seed = base || 'project';
  if (!taken.has(seed)) return seed;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${seed.slice(0, 37)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new HttpError(409, 'tidak menemukan nama yang belum terpakai');
}

/** Tebak perintah dev dari package.json, agar form impor terisi masuk akal. */
export async function detectDevCommand(path: string): Promise<string> {
  try {
    const raw = await readFile(join(path, 'package.json'), 'utf8');
    const scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {};
    for (const name of ['dev', 'start', 'serve']) {
      if (scripts[name]) return `npm run ${name}`;
    }
  } catch {
    // bukan project Node, atau package.json tidak terbaca
  }
  return config.defaultDevCommand;
}

export interface ImportProjectInput {
  path: string;
  name?: string;
  devCommand?: string;
  port?: number;
}

/**
 * Daftarkan folder yang sudah ada sebagai project, tanpa membuat atau mengubah
 * apa pun di dalamnya. Berguna untuk aplikasi yang sudah berjalan di VPS.
 */
export async function importProject(input: ImportProjectInput): Promise<Project> {
  if (!input.path?.trim()) throw new HttpError(400, 'path folder wajib diisi');

  let path: string;
  try {
    path = await realpath(resolve(expandHome(input.path.trim())));
  } catch {
    throw new HttpError(404, 'folder tidak ditemukan');
  }

  const info = await stat(path);
  if (!info.isDirectory()) throw new HttpError(400, 'path bukan folder');
  if (info.uid !== process.getuid?.()) {
    throw new HttpError(403, 'folder bukan milik user yang menjalankan panel');
  }

  const state = await readState();
  const taken = new Set(state.projects.map((p) => p.id));
  if (state.projects.some((p) => p.path === path)) {
    throw new HttpError(409, 'folder itu sudah terdaftar sebagai project');
  }

  const requested = input.name?.trim();
  if (requested && !PROJECT_NAME_RE.test(requested)) {
    throw new HttpError(400, 'nama hanya boleh a-z, 0-9, dan tanda hubung (maks 40)');
  }
  if (requested && taken.has(requested)) {
    throw new HttpError(409, 'project dengan nama itu sudah ada');
  }
  const id = requested ?? (await uniqueId(slugify(basename(path)), taken));

  let port = input.port;
  if (port !== undefined) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new HttpError(400, 'port tidak valid');
    }
    if (state.projects.some((p) => p.port === port)) {
      throw new HttpError(409, `port ${port} sudah dipakai project lain`);
    }
  } else {
    port = await allocatePort(state.projects);
  }

  const project: Project = {
    id,
    name: id,
    path,
    devCommand: input.devCommand?.trim() || (await detectDevCommand(path)),
    port,
    createdAt: new Date().toISOString(),
    managed: false,
  };

  await writeState({ projects: [...state.projects, project] });
  await ensureSession(project);
  return project;
}

export interface BrowseEntry {
  name: string;
  path: string;
  /** true bila folder itu sudah terdaftar sebagai project. */
  registered: boolean;
  hasPackageJson: boolean;
  hasGit: boolean;
}

/** Akar penelusuran untuk form impor: home user dan folder project. */
export function browseRoots(): string[] {
  const roots = [homedir(), config.projectsRoot];
  return [...new Set(roots.map((r) => resolve(r)))];
}

function isInsideAnyRoot(path: string): boolean {
  return browseRoots().some((root) => {
    if (path === root) return true;
    const rel = relative(root, path);
    return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
  });
}

/**
 * Daftar sub-folder untuk pemilih folder di UI. Dibatasi ke home dan
 * projectsRoot — bukan batas keamanan (pemilik panel memang punya shell),
 * melainkan agar penelusuran tetap relevan dan tidak menyasar ke / .
 */
export async function browseDirectories(rawPath?: string): Promise<{
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}> {
  const target = rawPath?.trim() ? resolve(expandHome(rawPath.trim())) : homedir();

  let path: string;
  try {
    path = await realpath(target);
  } catch {
    throw new HttpError(404, 'folder tidak ditemukan');
  }
  if (!isInsideAnyRoot(path)) throw new HttpError(400, 'folder di luar area penelusuran');

  const registered = new Set((await readState()).projects.map((p) => p.path));
  const entries: BrowseEntry[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const absolute = join(path, entry.name);
    try {
      if (!(await stat(absolute)).isDirectory()) continue;
    } catch {
      continue;
    }
    entries.push({
      name: entry.name,
      path: absolute,
      registered: registered.has(absolute),
      hasPackageJson: await pathExists(join(absolute, 'package.json')),
      hasGit: await pathExists(join(absolute, '.git')),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  const parent = isInsideAnyRoot(dirname(path)) && dirname(path) !== path ? dirname(path) : null;
  return { path, parent, entries };
}

function expandHome(path: string): string {
  return path === '~' || path.startsWith(`~${sep}`) ? join(homedir(), path.slice(1)) : path;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Hanya untuk tes: kosongkan cache state. */
export function resetStateCache(): void {
  cache = null;
}
