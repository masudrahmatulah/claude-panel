import type { ClaudeStatus, DevStatus } from '../types';

const CLAUDE_LABEL: Record<ClaudeStatus, string> = {
  running: 'Claude bekerja',
  waiting: 'Claude menunggu input',
  idle: 'Claude siap',
  off: 'Claude mati',
};

const DEV_LABEL: Record<DevStatus, string> = {
  up: 'Dev berjalan',
  starting: 'Dev memulai',
  off: 'Dev mati',
};

type Color = 'green' | 'yellow' | 'gray';

function claudeColor(status: ClaudeStatus): Color {
  if (status === 'running') return 'green';
  if (status === 'waiting') return 'yellow';
  if (status === 'idle') return 'green';
  return 'gray';
}

export function StatusLight({ color, label }: { color: Color; label: string }) {
  return (
    <span title={label}>
      <i className={`light ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function ProjectLights({ claude, dev }: { claude: ClaudeStatus; dev: DevStatus }) {
  return (
    <div className="status-row">
      <StatusLight color={claudeColor(claude)} label={CLAUDE_LABEL[claude]} />
      <StatusLight color={dev === 'up' ? 'green' : dev === 'starting' ? 'yellow' : 'gray'} label={DEV_LABEL[dev]} />
    </div>
  );
}
