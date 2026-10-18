import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Terminal } from '../components/Terminal';
import { FileManager } from '../components/FileManager';
import { ProjectLights } from '../components/StatusLight';
import type { Project, ProjectStatus } from '../types';

const TABS = [
  { id: 'claude', label: 'Claude' },
  { id: 'dev', label: 'Dev' },
  { id: 'shell', label: 'Shell' },
  { id: 'files', label: 'Files' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTab(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function ProjectPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab: TabId = isTab(params.get('tab')) ? (params.get('tab') as TabId) : 'claude';

  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.project(id);
      setProject(data.project);
      setStatus(data.status);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`Hapus project ${id} dari panel? Session tmux akan dimatikan.`)) return;
    // Folder hasil impor tidak pernah ditawarkan untuk dihapus.
    const deleteFiles =
      project?.managed !== false &&
      confirm('Hapus juga folder beserta isinya? Batal = simpan file.');
    await act(() => api.deleteProject(id, deleteFiles));
    navigate('/');
  };

  const isTerminalTab = tab !== 'files';

  return (
    <main>
      {error && <div className="banner error">{error}</div>}

      <div className="row between">
        <div>
          <h1 style={{ marginBottom: 2 }}>{project?.name ?? id}</h1>
          <p className="muted mono" style={{ margin: 0, fontSize: '0.85rem' }}>
            {project?.path}
            {project?.managed === false && <span className="muted"> · diimpor</span>}
          </p>
        </div>
        <button className="small danger" onClick={() => void remove()}>
          Hapus project
        </button>
      </div>

      <ProjectLights claude={status?.claude ?? 'off'} dev={status?.dev ?? 'off'} />

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setParams({ tab: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isTerminalTab ? (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="small" onClick={() => void act(() => api.stopWindow(id, tab))}>
              Stop ({tab})
            </button>
            <button className="small" onClick={() => void act(() => api.restartWindow(id, tab))}>
              Restart ({tab})
            </button>
            <span className="spacer" />
            <button className="small" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Tutup preview' : 'Preview'}
            </button>
            <a className="btn small" href={`/preview/${id}/`} target="_blank" rel="noreferrer">
              Buka tab baru
            </a>
          </div>

          {/* key memaksa terminal baru tiap jendela, agar attach-nya benar */}
          <Terminal key={`${id}-${tab}`} projectId={id} window={tab} />

          {showPreview && (
            <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
              <iframe
                title={`preview ${id}`}
                src={`/preview/${id}/`}
                style={{ width: '100%', height: '60vh', border: 0, background: '#fff' }}
              />
            </div>
          )}
        </>
      ) : (
        <FileManager projectId={id} />
      )}
    </main>
  );
}
