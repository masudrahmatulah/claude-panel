import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import { Backdrop } from './components/Backdrop';
import { Logo } from './components/Logo';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { NewProject } from './pages/NewProject';
import { ProjectPage } from './pages/ProjectPage';
import { Processes } from './pages/Processes';

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    void api
      .session()
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null)
    return (
      <>
        <Backdrop />
        <main className="empty">Memuat…</main>
      </>
    );
  if (!authenticated)
    return (
      <>
        <Backdrop />
        <Login onSuccess={() => setAuthenticated(true)} />
      </>
    );

  return (
    <BrowserRouter>
      <Backdrop />
      <div className="app">
        <header className="topbar">
          <span className="brand">
            <Logo size={26} />
            <span>claude-panel</span>
          </span>
          <nav>
            <NavLink to="/" end>
              Project
            </NavLink>
            <NavLink to="/processes">Proses</NavLink>
            <a
              href="#logout"
              onClick={(event) => {
                event.preventDefault();
                void api.logout().then(() => setAuthenticated(false));
              }}
            >
              Keluar
            </a>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewProject />} />
          <Route path="/p/:id" element={<ProjectPage />} />
          <Route path="/processes" element={<Processes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
