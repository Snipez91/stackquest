export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
