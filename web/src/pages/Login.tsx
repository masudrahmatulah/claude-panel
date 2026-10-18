import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (cause) {
      setError((cause as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <Logo size={64} className="logo" />
      <h1>claude-panel</h1>
      <p className="subtitle">Masuk untuk mengelola project di VPS.</p>
      <form className="card" onSubmit={submit}>
        {error && <div className="banner error">{error}</div>}
        <label>
          Password
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary" type="submit" disabled={busy || password.length === 0} style={{ width: '100%' }}>
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </main>
  );
}
