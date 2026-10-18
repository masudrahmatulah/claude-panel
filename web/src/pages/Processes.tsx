import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ListeningProcess } from '../types';

export function Processes() {
  const [processes, setProcesses] = useState<ListeningProcess[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setProcesses((await api.processes()).processes);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);

  const kill = async (item: ListeningProcess) => {
    // Konfirmasi wajib: tombol ini mematikan proses sungguhan di VPS.
    if (!confirm(`Kill PID ${item.pid} di port ${item.port}?\n${item.command}`)) return;
    try {
      await api.killProcess(item.pid);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <main>
      <h1>Proses</h1>
      <p className="subtitle">
        Proses yang sedang listen di port. Hentikan dev server lewat tombol Stop di project; kill di
        sini hanya pilihan terakhir.
      </p>

      {error && <div className="banner error">{error}</div>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>PID</th>
              <th>Port</th>
              <th>Perintah</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(processes ?? []).map((item) => (
              <tr key={`${item.pid}-${item.port}`}>
                <td className="mono">{item.pid}</td>
                <td className="mono">{item.port}</td>
                <td className="mono" style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>
                  {item.command}
                </td>
                <td>
                  <button
                    className="small danger"
                    disabled={!item.ownedByUs}
                    title={item.ownedByUs ? 'Kill proses' : 'Milik user lain — tidak bisa di-kill'}
                    onClick={() => void kill(item)}
                  >
                    Kill
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {processes !== null && processes.length === 0 && (
          <p className="empty">Tidak ada proses yang listen di port.</p>
        )}
      </div>
    </main>
  );
}
