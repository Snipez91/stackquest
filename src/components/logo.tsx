export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <svg aria-hidden width="26" height="26" viewBox="0 0 26 26" fill="none" className="drop-shadow-[0_0_8px_var(--glow)]">
        <defs>
          <linearGradient id="sq-g" x1="0" y1="0" x2="26" y2="26" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <path d="M13 1.5 23.5 7.5v11L13 24.5 2.5 18.5v-11L13 1.5Z" stroke="url(#sq-g)" strokeWidth="1.5" />
        <path d="M7 15.5 13 19l6-3.5M7 11.5 13 15l6-3.5M7 7.5 13 11l6-3.5" stroke="url(#sq-g)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-[family-name:var(--font-display)] text-[1.05em] tracking-[0.02em]">
        Stack<span className="text-gradient">Quest</span>
      </span>
    </span>
  );
}
