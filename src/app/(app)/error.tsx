"use client";

import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading this page</h1>
      <p className="mt-2 text-sm text-muted">
        Your work is saved as you go, so it&apos;s safe to retry.{error.digest ? ` (Reference: ${error.digest})` : ""}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button className="btn-primary" onClick={reset}>Try again</button>
        <Link href="/dashboard" className="btn-secondary">Dashboard</Link>
      </div>
    </div>
  );
}
