import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { QuickKeys } from './QuickKeys';

type Connection = 'connecting' | 'open' | 'closed';

/**
 * Terminal web untuk satu jendela tmux. Menutup komponen hanya melepas attach;
 * proses di tmux tetap berjalan.
 */
export function Terminal({ projectId, window: win }: { projectId: string; window: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  // Ctrl lengket: ditekan sekali, lalu huruf berikutnya dikirim sebagai Ctrl+huruf.
  const [ctrlArmed, setCtrlArmed] = useState(false);
  const ctrlRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: '#000000', foreground: '#e6edf3' },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws/terminal/${projectId}/${win}`);
    socketRef.current = socket;

    const sendResize = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    socket.addEventListener('open', () => {
      setConnection('open');
      sendResize();
      term.focus();
    });
    socket.addEventListener('message', (event) => term.write(event.data as string));
    socket.addEventListener('close', () => {
      setConnection('closed');
      term.write('\r\n\x1b[33m— koneksi terputus; session tmux tetap berjalan —\x1b[0m\r\n');
    });

    const onData = term.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      let payload = data;
      if (ctrlRef.current) {
        ctrlRef.current = false;
        setCtrlArmed(false);
        const code = data.length === 1 ? data.toUpperCase().charCodeAt(0) : 0;
        if (code >= 64 && code < 96) payload = String.fromCharCode(code - 64);
      }
      socket.send(JSON.stringify({ type: 'input', data: payload }));
    });

    // Terminal mengikuti ukuran layar, termasuk saat keyboard HP muncul.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
        sendResize();
      } catch {
        // host sedang tidak terlihat
      }
    });
    observer.observe(host);
    globalThis.addEventListener('orientationchange', sendResize);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener('orientationchange', sendResize);
      onData.dispose();
      socket.close();
      term.dispose();
      termRef.current = null;
      socketRef.current = null;
    };
  }, [projectId, win]);

  const send = (data: string) => {
    socketRef.current?.send(JSON.stringify({ type: 'input', data }));
    termRef.current?.focus();
  };

  return (
    <div className="terminal-shell">
      <div className="terminal-host" ref={hostRef} />
      <QuickKeys
        onSend={send}
        ctrlArmed={ctrlArmed}
        onToggleCtrl={() => {
          ctrlRef.current = !ctrlRef.current;
          setCtrlArmed(ctrlRef.current);
          termRef.current?.focus();
        }}
      />
      <div className="row" style={{ padding: '6px 10px' }}>
        <span className="conn">
          <i className={`light ${connection === 'open' ? 'green' : connection === 'connecting' ? 'yellow' : 'red'}`} />{' '}
          {connection === 'open' ? 'tersambung' : connection === 'connecting' ? 'menyambung…' : 'terputus'}
        </span>
        <span className="spacer" />
        {connection === 'closed' && (
          <button className="small" onClick={() => location.reload()}>
            Sambung ulang
          </button>
        )}
      </div>
    </div>
  );
}
