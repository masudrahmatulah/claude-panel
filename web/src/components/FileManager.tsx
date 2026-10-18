import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadFiles } from '../lib/api';
import type { FileEntry } from '../types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** File manager per project — pengganti FTP, dibatasi ke folder project. */
export function FileManager({ projectId }: { projectId: string }) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (next: string) => {
      setBusy(true);
      try {
        const data = await api.files(projectId, next);
        setEntries(data.entries);
        setPath(data.path);
        setError(null);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  const guard = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load(path);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setProgress(0);
    setError(null);
    try {
      await uploadFiles(projectId, path, files, {
        overwrite: false,
        onProgress: setProgress,
      });
      await load(path);
    } catch (cause) {
      const message = (cause as Error).message;
      // Menimpa file selalu minta konfirmasi lebih dulu.
      if (message.includes('sudah ada') && confirm(`${message}. Timpa file tersebut?`)) {
        await uploadFiles(projectId, path, files, { overwrite: true, onProgress: setProgress });
        await load(path);
      } else {
        setError(message);
      }
    } finally {
      setProgress(null);
    }
  };

  const crumbs = path ? path.split('/') : [];

  return (
    <div className="card">
      {error && <div className="banner error">{error}</div>}

      <div className="crumbs">
        <button onClick={() => void load('')}>{projectId}</button>
        {crumbs.map((part, index) => (
          <span key={`${part}-${index}`}>
            <span className="muted">/</span>
            <button onClick={() => void load(crumbs.slice(0, index + 1).join('/'))}>{part}</button>
          </span>
        ))}
      </div>

      <div
        className={`dropzone ${dragOver ? 'over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void upload([...event.dataTransfer.files]);
        }}
      >
        <p style={{ margin: '0 0 10px' }}>Tarik file ke sini, atau</p>
        <button className="primary" onClick={() => inputRef.current?.click()}>
          Pilih file
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            void upload([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        {progress !== null && (
          <div style={{ marginTop: 12 }}>
            <progress value={progress} max={100} />
            <div className="muted">{progress}%</div>
          </div>
        )}
      </div>

      <div className="row" style={{ margin: '14px 0' }}>
        <button
          className="small"
          onClick={() => {
            const name = prompt('Nama folder baru');
            if (name) void guard(() => api.mkdir(projectId, path ? `${path}/${name}` : name));
          }}
        >
          Folder baru
        </button>
        <a className="btn small" href={api.downloadUrl(projectId, path)}>
          Unduh folder ini (zip)
        </a>
        <span className="spacer" />
        <button className="small" onClick={() => void load(path)} disabled={busy}>
          Muat ulang
        </button>
      </div>

      {path && (
        <button className="small" onClick={() => void load(path.split('/').slice(0, -1).join('/'))}>
          ⬆ Naik satu folder
        </button>
      )}

      {entries.length === 0 && !busy ? (
        <p className="empty">Folder kosong.</p>
      ) : (
        <ul className="file-list">
          {entries.map((entry) => (
            <li key={entry.path}>
              <span aria-hidden="true">{entry.kind === 'dir' ? '📁' : '📄'}</span>
              <button
                className="name"
                onClick={() =>
                  entry.kind === 'dir'
                    ? void load(entry.path)
                    : globalThis.open(api.downloadUrl(projectId, entry.path), '_blank')
                }
              >
                {entry.name}
              </button>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {entry.kind === 'file' ? formatSize(entry.size) : ''}
              </span>
              <button
                className="small"
                title="Ganti nama"
                onClick={() => {
                  const next = prompt('Nama baru', entry.name);
                  if (next && next !== entry.name) {
                    const parent = path ? `${path}/` : '';
                    void guard(() => api.rename(projectId, entry.path, `${parent}${next}`));
                  }
                }}
              >
                Rename
              </button>
              <button
                className="small danger"
                onClick={() => {
                  if (confirm(`Hapus ${entry.name}? Tindakan ini tidak bisa dibatalkan.`)) {
                    void guard(() => api.removeFile(projectId, entry.path));
                  }
                }}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
