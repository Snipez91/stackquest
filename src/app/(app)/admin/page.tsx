import { redirect } from "next/navigation";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { listInvites, listMembers } from "@/server/teams";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { InviteForm, MemberControls, RevokeButton, TeamSettingsForm } from "./forms";

export const metadata = { title: "Team admin" };

function inviteStatus(i: { revokedAt: Date | null; expiresAt: Date; uses: number; maxUses: number }) {
  if (i.revokedAt) return "Revoked";
  if (i.expiresAt.getTime() <= Date.now()) return "Expired";
  if (i.uses >= i.maxUses) return "Used up";
  return "Active";
}

export default async function AdminPage() {
  const { user, team, role } = await requireContext();
  if (role !== "admin") redirect("/team");
  const db = await getDb();
  const [members, invites] = await Promise.all([listMembers(db, user.id, team.id), listInvites(db, user.id, team.id)]);
  return (
    <div className="space-y-6">
      <PageHeader title="Team administration" description="Invite teammates, manage roles, and moderate chat. Only admins see this page." />

      <Card className="p-5">
        <h2 className="font-semibold">Invite teammates</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Links are single-purpose secrets: they expire, have a use limit, and can be revoked. Share them privately (DM or email). We only store a hash, so a link is shown once.</p>
        <InviteForm />
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Invitations</h2>
        {invites.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No invitations yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Invitations</caption>
              <thead>
                <tr className="text-left text-xs text-faint">
                  <th scope="col" className="py-1.5 font-medium">Label</th>
                  <th scope="col" className="py-1.5 font-medium">Role</th>
                  <th scope="col" className="py-1.5 font-medium">Uses</th>
                  <th scope="col" className="py-1.5 font-medium">Expires</th>
                  <th scope="col" className="py-1.5 font-medium">Status</th>
                  <th scope="col" className="py-1.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => {
                  const st = inviteStatus(i);
                  return (
                    <tr key={i.id} className="border-t border-border">
                      <td className="py-2">{i.label ?? <span className="text-faint">—</span>}<span className="block text-xs text-faint">by {i.createdBy ?? "unknown"}</span></td>
                      <td className="py-2 capitalize">{i.role}</td>
                      <td className="py-2 tabular-nums">{i.uses}/{i.maxUses}</td>
                      <td className="py-2 text-xs text-muted">{i.expiresAt.toUTCString()}</td>
                      <td className="py-2"><span className={st === "Active" ? "text-success" : "text-muted"}>{st}</span></td>
                      <td className="py-2 text-right">{st === "Active" && <RevokeButton id={i.id} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Members</h2>
        <ul className="mt-3 divide-y divide-border">
          {members.map((m) => {
            const muted = !!m.mutedUntil && m.mutedUntil.getTime() > Date.now();
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={m.displayName} hue={m.avatarHue} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.displayName} {m.userId === user.id && <span className="text-xs text-faint">(you)</span>}</p>
                  <p className="text-xs text-faint">@{m.handle} · joined {m.joinedAt.toISOString().slice(0, 10)}{muted ? ` · muted until ${m.mutedUntil!.toUTCString()}` : ""}</p>
                </div>
                <MemberControls userId={m.userId} role={m.role} isSelf={m.userId === user.id} muted={muted} />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Team settings</h2>
        <TeamSettingsForm name={team.name} timezone={team.timezone} />
      </Card>
    </div>
  );
}
