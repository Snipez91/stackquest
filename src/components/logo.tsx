export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="14" width="18" height="6" rx="1.5" fill="var(--net)" opacity="0.9" />
        <rect x="5" y="8.5" width="14" height="5" rx="1.5" fill="var(--lx)" opacity="0.9" />
        <rect x="7" y="3.5" width="10" height="4.5" rx="1.5" fill="var(--py)" />
        <circle cx="18.5" cy="5.5" r="2" fill="var(--js)" />
      </svg>
      <span>StackQuest</span>
    </span>
  );
}
