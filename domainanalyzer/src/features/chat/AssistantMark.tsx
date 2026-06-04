// Custom assistant brand mark — a tilted orbit (ring + satellite + core).
// Reads as "visibility / tracking / presence", deliberately NOT the generic
// AI sparkle. Inherits color via currentColor so it sits on the gradient tile.

export function AssistantMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g transform="rotate(-24 12 12)">
        <ellipse cx="12" cy="12" rx="10" ry="4.3" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
        <circle cx="22" cy="12" r="1.7" fill="currentColor" />
      </g>
      <circle cx="12" cy="12" r="3.4" fill="currentColor" />
    </svg>
  );
}
