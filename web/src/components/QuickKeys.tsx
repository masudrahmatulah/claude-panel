/**
 * Keyboard HP tidak punya Ctrl, Tab, Esc, atau panah, padahal Claude Code dan
 * shell sangat bergantung padanya. Baris ini mengirim byte kontrolnya langsung.
 */
const KEYS: { label: string; data: string; title: string }[] = [
  { label: 'Esc', data: '\x1b', title: 'Escape' },
  { label: 'Tab', data: '\t', title: 'Tab' },
  { label: '↑', data: '\x1b[A', title: 'Panah atas' },
  { label: '↓', data: '\x1b[B', title: 'Panah bawah' },
  { label: '←', data: '\x1b[D', title: 'Panah kiri' },
  { label: '→', data: '\x1b[C', title: 'Panah kanan' },
  { label: 'Enter', data: '\r', title: 'Enter' },
  { label: '^C', data: '\x03', title: 'Ctrl+C — hentikan proses' },
  { label: '^D', data: '\x04', title: 'Ctrl+D' },
  { label: '^Z', data: '\x1a', title: 'Ctrl+Z' },
  { label: '^L', data: '\x0c', title: 'Bersihkan layar' },
  { label: '^R', data: '\x12', title: 'Cari riwayat perintah' },
];

interface Props {
  onSend: (data: string) => void;
  ctrlArmed: boolean;
  onToggleCtrl: () => void;
}

export function QuickKeys({ onSend, ctrlArmed, onToggleCtrl }: Props) {
  return (
    <div className="quick-keys" role="toolbar" aria-label="Tombol pintas terminal">
      <button
        className={ctrlArmed ? 'toggled' : ''}
        aria-pressed={ctrlArmed}
        title="Ctrl lengket: tekan ini lalu satu huruf di keyboard"
        onClick={onToggleCtrl}
      >
        Ctrl
      </button>
      {KEYS.map((key) => (
        <button key={key.label} title={key.title} onClick={() => onSend(key.data)}>
          {key.label}
        </button>
      ))}
    </div>
  );
}
