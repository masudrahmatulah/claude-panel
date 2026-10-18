import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ProjectLights } from '../components/StatusLight';
import type { Project } from '../types';

export function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      setProjects((await api.projects()).projects);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  // Status diperbarui lewat polling, bukan refresh manual.
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <main>
      <div className="row between">
        <div>
          <h1>Project</h1>
          <p className="subtitle">Claude Code, dev server, dan terminal untuk tiap project.</p>
        </div>
        <button className="primary" onClick={() => navigate('/new')}>
          + Tambah project
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {projects === null ? (
        <p className="empty">Memuat…</p>
      ) : projects.length === 0 ? (
        <p className="empty">Belum ada project. Buat yang pertama lewat tombol di atas.</p>
      ) : (
        <div className="grid">
          {projects.map((project) => (
            <article className="card" key={project.id}>
              <div className="row between">
                <h2 style={{ margin: 0 }}>{project.name}</h2>
                <span className="muted mono">:{project.port}</span>
              </div>
              <ProjectLights
                claude={project.status?.claude ?? 'off'}
                dev={project.status?.dev ?? 'off'}
              />
              <div className="row">
                <Link className="btn" to={`/p/${project.id}`}>
                  Buka
                </Link>
                <button className="small" onClick={() => void act(() => api.stopWindow(project.id, 'dev'))}>
                  Stop dev
                </button>
                <button className="small" onClick={() => void act(() => api.restartWindow(project.id, 'dev'))}>
                  Restart dev
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
