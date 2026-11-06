import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm text-faint">404</p>
        <h1 className="mt-2 text-2xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-muted">The link may be out of date, or the mission may have been renamed.</p>
        <Link href="/dashboard" className="btn-primary mt-6">Go to your dashboard</Link>
      </div>
    </main>
  );
}
