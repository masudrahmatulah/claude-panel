import type {
  BrowseResult,
  FileEntry,
  ListeningProcess,
  Project,
  ProjectStatus,
  Template,
} from '../types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers:
      init.body instanceof FormData
        ? init.headers
        : { 'content-type': 'application/json', ...init.headers },
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok) {
    const message = (data as { error?: string }).error ?? `permintaan gagal (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export const api = {
  session: () => request<{ authenticated: boolean }>('/api/session'),
  login: (password: string) =>
    request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),

  templates: () => request<{ templates: Template[] }>('/api/templates'),
  projects: () => request<{ projects: Project[] }>('/api/projects'),
  project: (id: string) =>
    request<{ project: Project; status: ProjectStatus }>(`/api/projects/${id}`),
  createProject: (body: { name: string; template: string; devCommand?: string }) =>
    request<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  importProject: (body: { path: string; name?: string; devCommand?: string; port?: number }) =>
    request<{ project: Project }>('/api/projects/import', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  browse: (path?: string) =>
    request<BrowseResult>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  detectDevCommand: (path: string) =>
    request<{ devCommand: string }>(`/api/detect-dev-command?path=${encodeURIComponent(path)}`),

  deleteProject: (id: string, deleteFiles: boolean) =>
    request<{ ok: true }>(`/api/projects/${id}?deleteFiles=${deleteFiles ? 1 : 0}`, {
      method: 'DELETE',
    }),

  stopWindow: (id: string, win: string) =>
    request<{ ok: true }>(`/api/projects/${id}/windows/${win}/stop`, { method: 'POST' }),
  restartWindow: (id: string, win: string) =>
    request<{ ok: true }>(`/api/projects/${id}/windows/${win}/restart`, { method: 'POST' }),

  processes: () => request<{ processes: ListeningProcess[] }>('/api/processes'),
  killProcess: (pid: number, force = false) =>
    request<{ ok: true }>(`/api/processes/${pid}?force=${force ? 1 : 0}`, { method: 'DELETE' }),

  files: (id: string, path: string) =>
    request<{ path: string; entries: FileEntry[] }>(
      `/api/projects/${id}/files?path=${encodeURIComponent(path)}`,
    ),
  mkdir: (id: string, path: string) =>
    request<{ ok: true }>(`/api/projects/${id}/files/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  rename: (id: string, from: string, to: string) =>
    request<{ ok: true }>(`/api/projects/${id}/files`, {
      method: 'PATCH',
      body: JSON.stringify({ from, to }),
    }),
  removeFile: (id: string, path: string) =>
    request<{ ok: true }>(`/api/projects/${id}/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),
  downloadUrl: (id: string, path: string) =>
    `/api/projects/${id}/files/download?path=${encodeURIComponent(path)}`,
};

/** Upload dengan progress, karena fetch belum punya progress unggahan. */
export function uploadFiles(
  id: string,
  dir: string,
  files: File[],
  options: { overwrite: boolean; onProgress: (percent: number) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);

    const xhr = new XMLHttpRequest();
    const overwrite = options.overwrite ? 1 : 0;
    xhr.open(
      'POST',
      `/api/projects/${id}/files?path=${encodeURIComponent(dir)}&overwrite=${overwrite}`,
    );
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) options.onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `unggah gagal (${xhr.status})`;
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        // biarkan pesan bawaan
      }
      reject(new ApiError(xhr.status, message));
    });
    xhr.addEventListener('error', () => reject(new ApiError(0, 'koneksi terputus saat mengunggah')));
    xhr.send(form);
  });
}
