import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { BrowseResult } from '../types';

/** Pemilih folder untuk mendaftarkan aplikasi yang sudah ada di VPS. */
export function FolderPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (path: string) => void;
}) {
  const [data, setData] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (path?: string) => {
    setBusy(true);
    try {
      setData(await api.browse(path));
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="card" style={{ background: 'var(--bg)' }}>
      {error && <div className="banner error">{error}</div>}

      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="mono muted" style={{ overflowWrap: 'anywhere', fontSize: '0.85rem' }}>
          {data?.path ?? 'memuat…'}
        </span>
        <button
          type="button"
          className="small"
          disabled={!data?.parent || busy}
          onClick={() => data?.parent && void load(data.parent)}
        >
          ⬆ Naik
        </button>
      </div>

      {data && data.entries.length === 0 ? (
        <p className="empty" style={{ padding: 20 }}>
          Tidak ada sub-folder di sini.
        </p>
      ) : (
        <ul className="file-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {data?.entries.map((entry) => (
            <li key={entry.path}>
              <span aria-hidden="true">📁</span>
              <button type="button" className="name" onClick={() => void load(entry.path)}>
                {entry.name}
              </button>
              {entry.hasPackageJson && (
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  node
                </span>
              )}
              {entry.hasGit && (
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  git
                </span>
              )}
              {entry.registered ? (
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  sudah terdaftar
                </span>
              ) : (
                <button type="button" className="small" onClick={() => onSelect(entry.path)}>
                  Pilih
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="small"
          disabled={!data || busy}
          onClick={() => data && onSelect(data.path)}
        >
          Pilih folder ini
        </button>
        {value && (
          <span className="muted mono" style={{ fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
            terpilih: {value}
          </span>
        )}
      </div>
    </div>
  );
}
