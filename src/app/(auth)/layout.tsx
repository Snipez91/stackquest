import Link from "next/link";
import { Logo } from "@/components/logo";
import { missionCount } from "@/content";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link href="/" className="text-lg">
          <Logo />
        </Link>
        <div className="max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">Lumen Logistics · on-call</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            Learn the stack by fixing it — with your team.
          </h2>
          <p className="mt-3 text-muted">
            Realistic missions in Python, Linux, JavaScript and networking. Practice in safe simulated labs, get specific
            feedback, and come back to what you learned before you forget it.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted">
            <li className="flex gap-2"><span className="text-lx">▸</span> {missionCount} missions across four tracks plus cross-track capstones</li>
            <li className="flex gap-2"><span className="text-py">▸</span> Spaced reviews that adapt to how well you remember</li>
            <li className="flex gap-2"><span className="text-net">▸</span> Team progress, leaderboards that reward learning, and chat</li>
          </ul>
        </div>
        <pre aria-hidden className="pointer-events-none rounded-lg border border-border bg-code p-4 font-mono text-[12px] leading-relaxed text-faint">
{`dev@web-01:~$ systemctl status lumen-api
● lumen-api.service - Lumen tracking API
   Active: failed (Result: exit-code)
dev@web-01:~$ journalctl -u lumen-api -n 1
open("/etc/lumen/api.conf"): Permission denied`}
        </pre>
      </aside>
      <main id="main" className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block text-lg lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
