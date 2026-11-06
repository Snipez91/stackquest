"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BookOpen, Gauge, Map, MessagesSquare, Repeat, Settings, Shield, Trophy, User, X, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { ChatPanel, type Me } from "@/components/chat/chat-panel";
import { ConnectionBanner, useRealtime } from "@/components/realtime";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/app/actions/auth";
import { switchTeamAction } from "@/app/actions/team";

type Team = { id: string; name: string; isDemo: boolean };

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/paths", label: "Learning paths", icon: Map },
  { href: "/review", label: "Review", icon: Repeat, badge: "due" as const },
  { href: "/team", label: "Team", icon: Trophy },
  { href: "/chat", label: "Chat", icon: MessagesSquare, badge: "chat" as const },
  { href: "/profile", label: "Profile", icon: User },
];

type DrawerCtx = { openChat: (opts?: { missionSlug?: string }) => void };
const ChatDrawerContext = createContext<DrawerCtx>({ openChat: () => {} });
export const useChatDrawer = () => useContext(ChatDrawerContext);

export function AppShell({ me, team, teams, isAdmin, dueCount, children }: { me: Me; team: Team; teams: Team[]; isAdmin: boolean; dueCount: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const { unread, mentions } = useRealtime();
  const [drawer, setDrawer] = useState<{ open: boolean; missionSlug?: string }>({ open: false });
  const openChat = useCallback((opts?: { missionSlug?: string }) => setDrawer({ open: true, missionSlug: opts?.missionSlug }), []);
  const inWorkspace = pathname.startsWith("/missions/") && !pathname.endsWith("/debrief");

  const badgeFor = (b?: "due" | "chat") => {
    if (b === "due" && dueCount > 0) return { text: String(dueCount), sr: `${dueCount} reviews due` };
    if (b === "chat" && unread > 0) return { text: mentions ? `@${mentions}` : String(unread), sr: `${unread} unread messages${mentions ? `, ${mentions} mentions` : ""}` };
    return null;
  };

  const nav = [...NAV, ...(isAdmin ? [{ href: "/admin", label: "Team admin", icon: Shield }] : [])];

  return (
    <ChatDrawerContext.Provider value={{ openChat }}>
      <div className="flex min-h-screen">
        <aside className={cn("sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface md:flex", inWorkspace && "md:hidden xl:flex")}>
          <div className="px-4 pt-4 pb-3">
            <Link href="/dashboard" className="text-[17px]">
              <Logo />
            </Link>
          </div>
          <TeamSwitcher team={team} teams={teams} />
          <nav aria-label="Main" className="mt-2 flex-1 space-y-0.5 px-2">
            {nav.map((n) => {
              const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
              const b = badgeFor("badge" in n ? n.badge : undefined);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", active ? "bg-surface-3 font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text")}
                >
                  <n.icon aria-hidden size={17} />
                  <span className="flex-1">{n.label}</span>
                  {b && (
                    <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-ink">
                      {b.text}
                      <span className="sr-only"> ({b.sr})</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-0.5 border-t border-border p-2">
            <Link href="/scoring" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text">
              <BookOpen aria-hidden size={17} /> How scoring works
            </Link>
            <Link href="/settings" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text">
              <Settings aria-hidden size={17} /> Settings
            </Link>
            <form action={signOutAction}>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text" type="submit">
                <LogOut aria-hidden size={17} /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className={cn("flex min-w-0 flex-1 flex-col", inWorkspace && "md:h-screen")}>
          {team.isDemo && (
            <div role="note" className="border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-center text-xs">
              <strong>Demo data — fictional.</strong> Teammates, activity and messages in this team are made up for demonstration.
            </div>
          )}
          <ConnectionBanner />
          <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur md:hidden">
            <Link href="/dashboard">
              <Logo />
            </Link>
            <span className="truncate text-xs text-muted">{team.name}</span>
          </header>
          <main id="main" className={cn("flex-1 pb-20 md:pb-0", inWorkspace ? "md:min-h-0 md:overflow-hidden" : "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8")}>
            {children}
          </main>
        </div>

        {/* Floating chat button: opens the drawer without leaving the page (workspace state is kept). */}
        {pathname !== "/chat" && !inWorkspace && (
          <button
            onClick={() => openChat()}
            className="fixed right-4 bottom-20 z-30 hidden items-center md:inline-flex gap-2 rounded-full border border-border-strong bg-surface-2 px-4 py-2.5 text-sm font-medium shadow-lg shadow-black/30 hover:bg-surface-3 md:bottom-5"
            aria-label={`Open team chat${unread ? `, ${unread} unread` : ""}`}
          >
            <MessagesSquare aria-hidden size={17} />
            Chat
            {unread > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-ink">{mentions ? `@${mentions}` : unread}</span>}
          </button>
        )}

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 backdrop-blur md:hidden">
          {nav.slice(0, 5).map((n) => {
            const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
            const b = badgeFor("badge" in n ? n.badge : undefined);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-text" : "text-muted")}>
                <n.icon aria-hidden size={19} />
                {n.label.replace("Learning paths", "Paths")}
                {b && (
                  <span className="absolute top-1 right-[22%] rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-ink">
                    {b.text}
                    <span className="sr-only"> ({b.sr})</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {drawer.open && <ChatDrawer me={me} missionSlug={drawer.missionSlug} onClose={() => setDrawer({ open: false })} />}
      </div>
    </ChatDrawerContext.Provider>
  );
}

function ChatDrawer({ me, missionSlug, onClose }: { me: Me; missionSlug?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("textarea, select, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label="Close chat" className="absolute inset-0 bg-black/40" onClick={onClose} tabIndex={-1} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Team chat" className="animate-rise relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Team chat</span>
          <div className="flex items-center gap-1">
            <Link href="/chat" className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
              Open full chat
            </Link>
            <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close chat">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel me={me} missionSlug={missionSlug} compact />
        </div>
      </div>
    </div>
  );
}

function TeamSwitcher({ team, teams }: { team: Team; teams: Team[] }) {
  if (teams.length <= 1) {
    return (
      <div className="mx-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <div className="text-[11px] text-faint">Team</div>
        <div className="truncate text-sm font-medium">{team.name}</div>
      </div>
    );
  }
  return (
    <div className="mx-3">
      <label htmlFor="team-switch" className="text-[11px] text-faint">
        Team
      </label>
      <select
        id="team-switch"
        className="input mt-0.5 py-1.5"
        value={team.id}
        onChange={(e) => {
          void switchTeamAction(e.target.value);
        }}
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
