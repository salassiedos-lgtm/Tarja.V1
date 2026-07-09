import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const IconPanel = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7.5" height="8.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
    <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.5" />
  </svg>
);

export const IconShip = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 18.5c1.6 0 1.6 1.4 3.2 1.4s1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4" />
    <path d="M4.5 15.5 6 10.2a1.4 1.4 0 0 1 1.35-1H16.7a1.4 1.4 0 0 1 1.34 1l1.46 5.3" />
    <path d="M12 9.2V5.5M9.4 5.5h5.2" />
  </svg>
);

export const IconClipboard = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
    <rect x="9" y="3" width="6" height="3.2" rx="1" />
    <path d="M9.2 11.5h5.6M9.2 15h3.4" />
  </svg>
);

export const IconRadar = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M12 12 18 6.2" />
  </svg>
);

export const IconWrench = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15.6 3.6a5 5 0 0 0-6.2 6.2L3.9 15.3a1.6 1.6 0 0 0 0 2.3l2.5 2.5a1.6 1.6 0 0 0 2.3 0l5.5-5.5a5 5 0 0 0 6.2-6.2l-2.9 2.9-2.9-.6-.6-2.9Z" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3 5 6v5.4c0 4.2 2.9 7.6 7 9.6 4.1-2 7-5.4 7-9.6V6l-7-3Z" />
    <path d="m9.2 12 2 2 3.6-3.8" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

export const IconBell = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5 1.5 5H5s1.5-1 1.5-5Z" />
    <path d="M10.2 18.5a2 2 0 0 0 3.6 0" />
  </svg>
);

export const IconLogout = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 7.5V5.8A1.8 1.8 0 0 0 12.2 4H6.3A1.8 1.8 0 0 0 4.5 5.8v12.4A1.8 1.8 0 0 0 6.3 20h5.9a1.8 1.8 0 0 0 1.8-1.8v-1.7" />
    <path d="M9.5 12h10m0 0-2.8-2.8M19.5 12l-2.8 2.8" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base} {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconArrow = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14m0 0-5-5m5 5-5 5" />
  </svg>
);

export const IconTag = (p: P) => (
  <svg {...base} {...p}>
    <path d="M11.3 3.5H6A2.5 2.5 0 0 0 3.5 6v5.3a2.5 2.5 0 0 0 .73 1.77l8.5 8.5a2.5 2.5 0 0 0 3.54 0l5.3-5.3a2.5 2.5 0 0 0 0-3.54l-8.5-8.5A2.5 2.5 0 0 0 11.3 3.5Z" />
    <circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRadio = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="9.5" width="18" height="10.5" rx="1.8" />
    <circle cx="8" cy="14.7" r="2.1" />
    <path d="M13.5 13.2h4M13.5 16.2h2.4" />
    <path d="m7 9.5 4.5-5.5M17.5 9.5 15 6" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12.5" r="8.3" />
    <path d="M12 8v4.7l3.2 2" />
  </svg>
);

export const IconSpark = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 2.5c1 2.4 1.6 4 3.6 5.4 2.2 1.6 3.4 3.4 3.4 5.8a7 7 0 0 1-14 0c0-1.6.6-2.7 1.6-3.8.2 1.4 1 2.2 1 2.2-.4-2.6.6-4.4 2.1-6a8 8 0 0 0 2.3-3.6Z" />
  </svg>
);

export const IconMirror = (p: P) => (
  <svg {...base} {...p}>
    <rect x="6.5" y="5" width="11" height="15" rx="5.5" />
    <path d="M6.5 9H3.2a1 1 0 0 0-1 1.3l1.1 3" />
    <path d="M17.5 9h3.3a1 1 0 0 1 1 1.3l-1.1 3" />
  </svg>
);

export const IconAntenna = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 21V9" />
    <path d="M12 9 5 4M12 9l7-5" />
    <path d="M5 4 3 2M19 4l2-2" />
  </svg>
);

export const IconLayers = (p: P) => (
  <svg {...base} {...p}>
    <path d="m12 3 8.5 4.6L12 12.2 3.5 7.6 12 3Z" />
    <path d="m3.5 12 8.5 4.6L20.5 12" />
    <path d="m3.5 16.4 8.5 4.6 8.5-4.6" />
  </svg>
);

export const IconWiper = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20c3-9.5 8-15.5 16-15.5" />
    <circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" />
    <path d="M9 20c1.6-6.4 5-11 11.5-12.8" />
  </svg>
);

export const IconTire = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.4" />
    <path d="M12 3.5V8.6M12 15.4v5.1M3.5 12h5.1M15.4 12h5.1" />
  </svg>
);

export const IconJack = (p: P) => (
  <svg {...base} {...p}>
    <rect x="5" y="15" width="14" height="4.5" rx="1" />
    <path d="M8.5 15V9.5a3.5 3.5 0 0 1 7 0V15" />
    <path d="M12 9.5V5" />
  </svg>
);

export const IconKey = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="7.3" cy="16.7" r="3.8" />
    <path d="m9.9 14.1 9.6-9.6M16.5 7.5l2.4 2.4M13.7 10.3l2 2" />
  </svg>
);

export const IconBook = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 5.2A1.7 1.7 0 0 1 5.7 3.5H12v17H5.7A1.7 1.7 0 0 1 4 18.8Z" />
    <path d="M20 5.2a1.7 1.7 0 0 0-1.7-1.7H12v17h6.3a1.7 1.7 0 0 0 1.7-1.7Z" />
  </svg>
);

export const IconBolt = (p: P) => (
  <svg {...base} {...p}>
    <path d="M13 2.5 4.5 13.5H11l-1.5 8L18 10.5h-6.5l1.5-8Z" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconEdit = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20.5h4.2L18.8 9.9a2.2 2.2 0 0 0 0-3.1l-1.6-1.6a2.2 2.2 0 0 0-3.1 0L3.5 15.8v4.7Z" />
    <path d="m13.2 6.2 4.6 4.6" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
    <path d="M6.5 7 7.3 19a1.8 1.8 0 0 0 1.8 1.7h5.8a1.8 1.8 0 0 0 1.8-1.7L17.5 7" />
    <path d="M10.3 11v6M13.7 11v6" />
  </svg>
);

export const IconUpload = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
    <path d="M12 15.5V4m0 0L7.5 8.5M12 4l4.5 4.5" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.5 2.7 19.5a1.2 1.2 0 0 0 1.05 1.8h16.5a1.2 1.2 0 0 0 1.05-1.8L12 3.5Z" />
    <path d="M12 9.5v4.5M12 17.3v.2" />
  </svg>
);

export const IconAshtray = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 13.5h17l-1.4 4.6a2 2 0 0 1-1.9 1.4H6.8a2 2 0 0 1-1.9-1.4L3.5 13.5Z" />
    <path d="M14 13.5V12a1 1 0 0 1 1-1h4.5" />
    <path d="M9.2 8.4c.8-.8.8-2 0-2.8M12.6 8.4c.8-.8.8-2 0-2.8" />
  </svg>
);

export const IconDisc = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 5.6v2.1M12 16.3v2.1M5.6 12h2.1M16.3 12h2.1" />
    <path d="m7.5 7.5 1.5 1.5M15 15l1.5 1.5M16.5 7.5 15 9M9 15l-1.5 1.5" />
  </svg>
);

/** Marca COSCO: dos arcos entrelazados (navy + rojo) */
export const CoscoMark = (p: P) => (
  <svg viewBox="0 0 40 40" fill="none" {...p}>
    <path
      d="M20 4.5c-8.2 0-14.9 5.6-14.9 12.5 0 4 2.2 7.5 5.7 9.8"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      opacity="0.95"
    />
    <path
      d="M20 35.5c8.2 0 14.9-5.6 14.9-12.5 0-4-2.2-7.5-5.7-9.8"
      stroke="#C8102E"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M12.5 20a7.5 7.5 0 0 1 15 0"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      opacity="0.5"
    />
  </svg>
);
