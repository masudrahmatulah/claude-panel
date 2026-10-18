import { useId } from 'react';

/** Logo panel; versi file mandirinya ada di assets/logo.svg untuk favicon. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const gradient = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#9d6bff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradient})`} />
      <g fill="#fff" fillOpacity="0.55">
        <circle cx="13" cy="13" r="2.6" />
        <circle cx="21" cy="13" r="2.6" />
        <circle cx="29" cy="13" r="2.6" />
      </g>
      <g fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 27l10 9.5L17 46" />
        <path d="M33 46h14" />
      </g>
    </svg>
  );
}
