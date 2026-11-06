import Link from "next/link";
import type { ReactNode } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { masteryBand } from "@/lib/rules";
import { cn } from "@/lib/cn";

export const TRACK_META: Record<string, { label: string; color: string; text: string; bg: string; border: string; short: string }> = {
  python: { label: "Python", short: "PY", color: "var(--py)", text: "text-py", bg: "bg-py/12", border: "border-py/40" },
  linux: { label: "Linux", short: "LX", color: "var(--lx)", text: "text-lx", bg: "bg-lx/12", border: "border-lx/40" },
  javascript: { label: "JavaScript", short: "JS", color: "var(--js)", text: "text-js", bg: "bg-js/12", border: "border-js/40" },
  networking: { label: "Networking", short: "NET", color: "var(--net)", text: "text-net", bg: "bg-net/12", border: "border-net/40" },
  capstone: { label: "Capstone", short: "CAP", color: "var(--cap)", text: "text-cap", bg: "bg-cap/12", border: "border-cap/40" },
};

export function TrackPill({ track, className }: { track: string; className?: string }) {
  const t = TRACK_META[track] ?? TRACK_META.python;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", t.border, t.bg, t.text, className)}>
      <span aria-hidden className="font-mono text-[10px] opacity-80">{t.short}</span>
      {t.label}
    </span>
  );
}

export function TierBadge({ tier }: { tier: string }) {
  const icon = tier === "beginner" ? "●○○" : tier === "intermediate" ? "●●○" : "●●●";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      <span aria-hidden className="tracking-[-2px] text-[9px]">{icon}</span>
      <span className="capitalize">{tier}</span>
    </span>
  );
}

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li" }) {
  return <As className={cn("card", className)}>{children}</As>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Progress({ value, max = 100, label, color, className }: { value: number; max?: number; label: string; color?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color ?? "var(--primary)" }} />
    </div>
  );
}

/** Mastery shown as a number + text band + bar, never colour alone. */
export function MasteryMeter({ score, compact }: { score: number; compact?: boolean }) {
  const band = masteryBand(score);
  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-[120px]" : "min-w-[160px]")}>
      <Progress value={score} label={`Mastery estimate ${Math.round(score)} of 100, ${band.label}`} className="flex-1" color={score >= 80 ? "var(--success)" : score >= 55 ? "var(--primary)" : score >= 30 ? "var(--warning)" : "var(--faint)"} />
      <span className="w-[86px] shrink-0 text-right text-xs text-muted">
        {band.label}
        {!compact && <span className="ml-1 font-mono text-faint">{Math.round(score)}</span>}
      </span>
    </div>
  );
}

export function Avatar({ name, hue, size = 32, online }: { name: string; hue: number; size?: number; online?: boolean }) {
  const initials = name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="inline-flex h-full w-full items-center justify-center rounded-full font-semibold text-[#0a0d13]"
        style={{ background: `hsl(${hue} 70% 72%)`, fontSize: size * 0.38 }}
      >
        {initials || "?"}
      </span>
      {online !== undefined && (
        <span
          className={cn("absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface", online ? "bg-success" : "bg-surface-3")}
          title={online ? "Online" : "Offline"}
        >
          <span className="sr-only">{online ? "online" : "offline"}</span>
        </span>
      )}
    </span>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={cn("prose-sq", className)} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function LinkButton({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return (
    <Link href={href} className={cn(variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : "btn-ghost", className)}>
      {children}
    </Link>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode; title?: string }) {
  const styles = {
    info: "border-primary/40 bg-primary/8",
    warning: "border-warning/50 bg-warning/8",
    danger: "border-danger/50 bg-danger/8",
    success: "border-success/50 bg-success/8",
  }[tone];
  const label = { info: "Note", warning: "Heads up", danger: "Problem", success: "Done" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cn("rounded-lg border px-3.5 py-2.5 text-sm", styles)}>
      <span className="sr-only">{label}: </span>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      <div className="text-text/90">{children}</div>
    </div>
  );
}
