export type ClaudeStatus = 'running' | 'waiting' | 'idle' | 'off';
export type DevStatus = 'up' | 'starting' | 'off';
export type WindowName = 'claude' | 'dev' | 'shell';

export interface ProjectStatus {
  id: string;
  sessionAlive: boolean;
  claude: ClaudeStatus;
  dev: DevStatus;
  port: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  devCommand: string;
  port: number;
  template?: string;
  createdAt?: string;
  /** false bila folder hanya didaftarkan (impor), bukan dibuat panel. */
  managed?: boolean;
  status?: ProjectStatus;
}

export interface BrowseEntry {
  name: string;
  path: string;
  registered: boolean;
  hasPackageJson: boolean;
  hasGit: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface Template {
  id: string;
  label: string;
  devCommand: string;
}

export interface ListeningProcess {
  pid: number;
  port: number;
  address: string;
  command: string;
  ownedByUs: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  size: number;
  modifiedAt: string;
}
