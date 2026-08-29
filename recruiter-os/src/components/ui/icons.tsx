import React from 'react';

/** Inline 20x20 stroke icons — no icon library, no runtime cost. */
type IconProps = { className?: string; size?: number };

function Svg({ children, className, size = 20 }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Home: (p: IconProps) => (
    <Svg {...p}><path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5Z" /></Svg>
  ),
  Users: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7.5" cy="7" r="2.6" /><path d="M2.5 16c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2" />
      <path d="M13.5 5.2a2.4 2.4 0 0 1 0 4.6M14.5 11.9c1.8.4 3 1.8 3 3.6" />
    </Svg>
  ),
  Briefcase: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="6" width="15" height="10.5" rx="1.6" />
      <path d="M7 6V4.6A1.6 1.6 0 0 1 8.6 3h2.8A1.6 1.6 0 0 1 13 4.6V6M2.5 10.5h15" />
    </Svg>
  ),
  Building: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="3" width="9" height="14" rx="1.2" /><path d="M12.5 8h4v9h-4" />
      <path d="M6 6h3M6 9h3M6 12h3" />
    </Svg>
  ),
  Board: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="3.5" width="4" height="13" rx="1" /><rect x="8" y="3.5" width="4" height="9" rx="1" />
      <rect x="13.5" y="3.5" width="4" height="11" rx="1" />
    </Svg>
  ),
  Check: (p: IconProps) => <Svg {...p}><path d="m4 10.5 4 4 8-9" /></Svg>,
  CheckSquare: (p: IconProps) => (
    <Svg {...p}><rect x="3" y="3" width="14" height="14" rx="2.5" /><path d="m6.5 10 2.5 2.5 4.5-5" /></Svg>
  ),
  Money: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="5" width="15" height="10" rx="2" /><circle cx="10" cy="10" r="2.2" />
      <path d="M5.5 8v4M14.5 8v4" />
    </Svg>
  ),
  Chart: (p: IconProps) => <Svg {...p}><path d="M3 16.5h14M6 13V8M10 16V4.5M14 16v-6" /></Svg>,
  Sparkles: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10 3.5 11.3 7 15 8.3 11.3 9.6 10 13 8.7 9.6 5 8.3 8.7 7 10 3.5Z" />
      <path d="M15.5 13.5 16 15l1.5.5-1.5.5-.5 1.5-.5-1.5L13 15l1.5-.5.5-1.5Z" />
    </Svg>
  ),
  Bolt: (p: IconProps) => <Svg {...p}><path d="M11 2.5 4.5 11h4l-.5 6.5L15 9h-4l.5-6.5Z" /></Svg>,
  Settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
    </Svg>
  ),
  Search: (p: IconProps) => <Svg {...p}><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3.5 3.5" /></Svg>,
  Plus: (p: IconProps) => <Svg {...p}><path d="M10 4.5v11M4.5 10h11" /></Svg>,
  Phone: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6.5 3.5 8 6.5 6.5 8a9 9 0 0 0 5.5 5.5L13.5 12l3 1.5v2.2c0 .7-.6 1.3-1.3 1.2C8.4 16.3 3.7 11.6 3.1 4.8c-.1-.7.5-1.3 1.2-1.3h2.2Z" />
    </Svg>
  ),
  Mail: (p: IconProps) => (
    <Svg {...p}><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="m3 6 7 4.5L17 6" /></Svg>
  ),
  Chat: (p: IconProps) => (
    <Svg {...p}><path d="M17 9.8c0 3.2-3.1 5.8-7 5.8-.9 0-1.7-.1-2.5-.4L3.5 16.5l1.2-3A5.6 5.6 0 0 1 3 9.8C3 6.6 6.1 4 10 4s7 2.6 7 5.8Z" /></Svg>
  ),
  Clock: (p: IconProps) => <Svg {...p}><circle cx="10" cy="10" r="7" /><path d="M10 6v4.2l2.6 1.6" /></Svg>,
  Calendar: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" />
    </Svg>
  ),
  Doc: (p: IconProps) => (
    <Svg {...p}><path d="M11.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Z" /><path d="M11.5 2.5v4h4" /></Svg>
  ),
  Upload: (p: IconProps) => (
    <Svg {...p}><path d="M10 13.5V4M6.5 7.5 10 4l3.5 3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" /></Svg>
  ),
  Trash: (p: IconProps) => (
    <Svg {...p}><path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6M6 6l.7 9.6A1.5 1.5 0 0 0 8.2 17h3.6a1.5 1.5 0 0 0 1.5-1.4L14 6" /></Svg>
  ),
  Edit: (p: IconProps) => (
    <Svg {...p}><path d="M13.5 3.9 16.1 6.5 7.6 15H5v-2.6l8.5-8.5Z" /><path d="M3 17.5h14" /></Svg>
  ),
  ArrowLeft: (p: IconProps) => <Svg {...p}><path d="M16 10H4M9 5l-5 5 5 5" /></Svg>,
  ArrowRight: (p: IconProps) => <Svg {...p}><path d="M4 10h12M11 5l5 5-5 5" /></Svg>,
  Menu: (p: IconProps) => <Svg {...p}><path d="M3 6h14M3 10h14M3 14h14" /></Svg>,
  Logout: (p: IconProps) => (
    <Svg {...p}><path d="M8 17H5.5A1.5 1.5 0 0 1 4 15.5v-11A1.5 1.5 0 0 1 5.5 3H8M12.5 13.5 16 10l-3.5-3.5M16 10H7.5" /></Svg>
  ),
  Star: (p: IconProps) => (
    <Svg {...p}><path d="m10 3 2.1 4.4 4.9.6-3.6 3.4.9 4.8L10 13.9 5.7 16.2l.9-4.8L3 8l4.9-.6L10 3Z" /></Svg>
  ),
  MapPin: (p: IconProps) => (
    <Svg {...p}><path d="M10 17.5s5.5-5 5.5-9a5.5 5.5 0 1 0-11 0c0 4 5.5 9 5.5 9Z" /><circle cx="10" cy="8.5" r="2" /></Svg>
  ),
  Target: (p: IconProps) => (
    <Svg {...p}><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.5" /><circle cx="10" cy="10" r="0.8" fill="currentColor" /></Svg>
  ),
  Alert: (p: IconProps) => (
    <Svg {...p}><path d="M10 3.5 17.5 16h-15L10 3.5Z" /><path d="M10 8.5v3M10 13.8v.2" /></Svg>
  ),
};

export type IconName = keyof typeof Icon;
