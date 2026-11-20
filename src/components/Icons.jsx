/** Tiny inline SVG icons (no icon library needed). */
const base = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true };

export const PlayIcon = (p) => (
  <svg {...base} {...p} fill="currentColor"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" /></svg>
);
export const PauseIcon = (p) => (
  <svg {...base} {...p} fill="currentColor"><rect x="3.5" y="2.5" width="3" height="11" rx=".8" /><rect x="9.5" y="2.5" width="3" height="11" rx=".8" /></svg>
);
export const GearIcon = (p) => (
  <svg {...base} {...p} fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7 3.4 3.4" strokeLinecap="round" />
  </svg>
);
export const XIcon = (p) => (
  <svg {...base} {...p} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m4 4 8 8M12 4l-8 8" /></svg>
);
export const RefreshIcon = ({ spinning, ...p }) => (
  <svg {...base} {...p} className={spinning ? 'animate-spin' : ''} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
  </svg>
);
export const ChevronIcon = ({ open, ...p }) => (
  <svg {...base} {...p} className={`transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m4 6 4 4 4-4" /></svg>
);
