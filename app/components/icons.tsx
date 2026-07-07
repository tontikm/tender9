type IconProps = { className?: string };

const base = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconBuilding({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </svg>
  );
}

export function IconTag({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8 8a2 2 0 0 0 2.828 0l7.172-7.172a2 2 0 0 0 0-2.828z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

export function IconMapPin({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function IconCoin({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.5a2.8 2.5 0 0 0-2.8-1.5c-1.7 0-3 1-3 2.3 0 1.4 1.3 1.9 3 2.2 1.7.3 3 .9 3 2.3 0 1.3-1.3 2.2-3 2.2a2.8 2.8 0 0 1-2.8-1.5M12 6.5v1M12 16.5v1" />
    </svg>
  );
}
