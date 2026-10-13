export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="4" y="21" width="24" height="6" rx="1.5" fill="var(--ambre)" />
      <rect x="8" y="13" width="16" height="6" rx="1.5" fill="var(--data)" opacity=".9" />
      <rect x="12" y="5" width="8" height="6" rx="1.5" fill="var(--fullstack)" opacity=".85" />
    </svg>
  );
}

