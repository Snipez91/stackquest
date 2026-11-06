/** Decorative "mission radar". Purely visual (aria-hidden); rotation stops under reduced motion. */
export function Orbit({ color = "var(--primary)", className = "" }: { color?: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={`pointer-events-none ${className}`}>
      <defs>
        <radialGradient id="orbit-core">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orbit-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#orbit-core)" />
      {[92, 68, 44, 20].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke={color} strokeOpacity="0.22" strokeDasharray={r === 68 ? "2 6" : undefined} />
      ))}
      <line x1="4" y1="100" x2="196" y2="100" stroke={color} strokeOpacity="0.12" />
      <line x1="100" y1="4" x2="100" y2="196" stroke={color} strokeOpacity="0.12" />
      <g className="origin-center animate-[spin_9s_linear_infinite]" style={{ transformBox: "view-box" }}>
        <path d="M100 100 L196 100 A96 96 0 0 0 168 32 Z" fill="url(#orbit-sweep)" />
      </g>
      <circle cx="146" cy="62" r="3" fill={color}>
        <animate attributeName="opacity" values="1;0.2;1" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="58" cy="132" r="2.5" fill="var(--accent)" />
      <circle cx="100" cy="100" r="3.5" fill={color} />
    </svg>
  );
}
