import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { FolderPicker } from '../components/FolderPicker';
import type { Template } from '../types';

const NAME_RE = /^[a-z0-9-]{1,40}$/;

type Mode = 'create' | 'import';

export function NewProject() {
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('empty');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [path, setPath] = useState('');
  const [devCommand, setDevCommand] = useState('');
  const [port, setPort] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void api
      .templates()
      .then((data) => setTemplates(data.templates))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  // Saat folder dipilih, tebak nama dan perintah dev agar form tidak kosong.
  const selectPath = async (selected: string) => {
    setPath(selected);
    const base = selected.split('/').pop() ?? '';
    if (!name) setName(base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''));
    try {
      const detected = await api.detectDevCommand(selected);
      setDevCommand(detected.devCommand);
    } catch {
      // biarkan kosong; server akan memakai bawaan
    }
  };

  const nameValid = NAME_RE.test(name);
  const canSubmit = mode === 'create' ? nameValid : path.length > 0 && (!name || nameValid);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project } =
        mode === 'create'
          ? await api.createProject({ name, template })
          : await api.importProject({
              path,
              name: name || undefined,
              devCommand: devCommand || undefined,
              port: port ? Number.parseInt(port, 10) : undefined,
            });
      navigate(`/p/${project.id}?tab=claude`);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>Tambah project</h1>

      <div className="tabs" role="tablist" style={{ marginTop: 14 }}>
        <button
          role="tab"
          aria-selected={mode === 'create'}
          onClick={() => setMode('create')}
          type="button"
        >
          Buat baru
        </button>
        <button
          role="tab"
          aria-selected={mode === 'import'}
          onClick={() => setMode('import')}
          type="button"
        >
          Folder yang sudah ada
        </button>
      </div>

      <p className="subtitle">
        {mode === 'create' ? (
          <>
            Membuat folder, menjalankan <code>git init</code>, lalu membuka session tmux dengan
            jendela claude, dev, dan shell.
          </>
        ) : (
          <>
            Mendaftarkan folder yang sudah ada apa adanya. Panel tidak membuat, mengubah, atau
            menghapus isinya — hanya membuka session tmux di folder itu.
          </>
        )}
      </p>

      <form className="card" onSubmit={submit}>
        {error && <div className="banner error">{error}</div>}

        {mode === 'import' && (
          <>
            <label>
              Folder aplikasi
              <input
                value={path}
                placeholder="/home/user/aplikasi-saya"
                onChange={(event) => setPath(event.target.value)}
              />
            </label>
            <FolderPicker value={path} onSelect={(selected) => void selectPath(selected)} />
            <div style={{ height: 14 }} />
          </>
        )}

        <label>
          Nama project {mode === 'import' && <span className="muted">(opsional)</span>}
          <input
            value={name}
            placeholder={mode === 'import' ? 'diambil dari nama folder' : 'toko-online'}
            onChange={(event) => setName(event.target.value.toLowerCase())}
          />
        </label>
        {name.length > 0 && !nameValid && (
          <p className="muted" style={{ marginTop: -8 }}>
            Hanya huruf kecil, angka, dan tanda hubung (maks 40 karakter).
          </p>
        )}

        {mode === 'create' ? (
          <label>
            Template
            <select value={template} onChange={(event) => setTemplate(event.target.value)}>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Perintah dev
              <input
                value={devCommand}
                placeholder="npm run dev"
                onChange={(event) => setDevCommand(event.target.value)}
              />
            </label>
            <label>
              Port dev server <span className="muted">(kosongkan untuk otomatis)</span>
              <input
                value={port}
                inputMode="numeric"
                placeholder="3100"
                onChange={(event) => setPort(event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <p className="muted" style={{ marginTop: -8 }}>
              Port ini dipakai untuk preview, dan dikirim sebagai variabel <code>PORT</code> ke
              perintah dev. Bila aplikasi Anda menetapkan portnya sendiri, isi dengan port itu.
            </p>
          </>
        )}

        <button className="primary" type="submit" disabled={!canSubmit || busy}>
          {busy
            ? mode === 'create'
              ? 'Membuat…'
              : 'Mendaftarkan…'
            : mode === 'create'
              ? 'Buat project'
              : 'Tambahkan project'}
        </button>
      </form>
    </main>
  );
}
