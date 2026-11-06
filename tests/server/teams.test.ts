import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import { invites, memberships } from "@/server/db/schema";
import { acceptInvite, changeRole, createInvite, createTeam, listInvites, listMembers, previewInvite, removeMember, requireMembership, revokeInvite } from "@/server/teams";
import { signIn, createSession, userForSessionToken, signUp } from "@/server/auth/core";
import { makeUser, testDb } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

describe("authentication", () => {
  it("signs up, signs in, and resolves a session token", async () => {
    await signUp(db, { email: "Pat@Example.test", password: "a long passphrase", displayName: "Pat", timezone: "UTC" });
    const u = await signIn(db, "pat@example.test", "a long passphrase");
    const { token } = await createSession(db, u.id);
    expect((await userForSessionToken(db, token))?.user.id).toBe(u.id);
    expect(await userForSessionToken(db, token + "x")).toBeNull();
  });
  it("rejects a wrong password and short passwords", async () => {
    await signUp(db, { email: "a@example.test", password: "a long passphrase", displayName: "A", timezone: "UTC" }).catch(() => {});
    await expect(signIn(db, "a@example.test", "nope")).rejects.toThrow(/don't match/);
    await expect(signUp(db, { email: "b@example.test", password: "short", displayName: "Bee", timezone: "UTC" })).rejects.toThrow(/at least 10/);
  });
  it("rate-limits repeated failed sign-ins for one email", async () => {
    await signUp(db, { email: "c@example.test", password: "a long passphrase", displayName: "Cee", timezone: "UTC" });
    for (let i = 0; i < 8; i++) await signIn(db, "c@example.test", "wrong", `ip${i}`).catch(() => {});
    await expect(signIn(db, "c@example.test", "a long passphrase", "fresh-ip")).rejects.toThrow(/Too many/);
  });
});

describe("team invitations", () => {
  it("lets a new user join through an invitation link", async () => {
    const admin = await makeUser(db, "Admin");
    const team = await createTeam(db, admin.id, { name: "Platform", timezone: "UTC" });
    const { token } = await createInvite(db, admin.id, team.id, { maxUses: 1, expiresInHours: 24 });
    expect((await previewInvite(db, token)).status).toBe("valid");
    const joiner = await makeUser(db, "Joiner");
    const r = await acceptInvite(db, joiner.id, token);
    expect(r).toEqual({ teamId: team.id, alreadyMember: false });
    expect((await requireMembership(db, joiner.id, team.id)).role).toBe("member");
    // Used up now.
    expect((await previewInvite(db, token)).status).toBe("used_up");
    const third = await makeUser(db, "Third");
    await expect(acceptInvite(db, third.id, token)).rejects.toThrow(/already been used/);
  });

  it("stores only a hash of the token", async () => {
    const admin = await makeUser(db);
    const team = await createTeam(db, admin.id, { name: "Team T", timezone: "UTC" });
    const { token } = await createInvite(db, admin.id, team.id, {});
    const rows = await db.select().from(invites);
    expect(rows[0].tokenHash).not.toContain(token);
    expect(rows[0].tokenHash).toHaveLength(64);
  });

  it("rejects expired and revoked invites", async () => {
    const admin = await makeUser(db);
    const team = await createTeam(db, admin.id, { name: "Team T", timezone: "UTC" });
    const a = await createInvite(db, admin.id, team.id, {});
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invites.id, a.invite.id));
    const u = await makeUser(db);
    expect((await previewInvite(db, a.token)).status).toBe("expired");
    await expect(acceptInvite(db, u.id, a.token)).rejects.toThrow(/expired/);
    const b = await createInvite(db, admin.id, team.id, {});
    await revokeInvite(db, admin.id, team.id, b.invite.id);
    await expect(acceptInvite(db, u.id, b.token)).rejects.toThrow(/revoked/);
    await expect(acceptInvite(db, u.id, "not-a-real-token-at-all-xxxxxxxx")).rejects.toThrow(/isn't valid/);
  });

  it("honours max uses under concurrent accepts", async () => {
    const admin = await makeUser(db);
    const team = await createTeam(db, admin.id, { name: "Team T", timezone: "UTC" });
    const { token } = await createInvite(db, admin.id, team.id, { maxUses: 2 });
    const users = await Promise.all([1, 2, 3, 4].map(() => makeUser(db)));
    const results = await Promise.allSettled(users.map((u) => acceptInvite(db, u.id, token)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await db.select().from(memberships).where(eq(memberships.teamId, team.id))).length).toBe(3);
  });

  it("does not consume a use when an existing member re-opens the link", async () => {
    const admin = await makeUser(db);
    const team = await createTeam(db, admin.id, { name: "Team T", timezone: "UTC" });
    const { token, invite } = await createInvite(db, admin.id, team.id, { maxUses: 1 });
    const r = await acceptInvite(db, admin.id, token);
    expect(r.alreadyMember).toBe(true);
    const [row] = await db.select().from(invites).where(eq(invites.id, invite.id));
    expect(row.uses).toBe(0);
  });
});

describe("roles and isolation", () => {
  it("only admins can create invites, change roles, or remove others", async () => {
    const admin = await makeUser(db);
    const team = await createTeam(db, admin.id, { name: "Team T", timezone: "UTC" });
    const { token } = await createInvite(db, admin.id, team.id, { maxUses: 5 });
    const member = await makeUser(db);
    await acceptInvite(db, member.id, token);
    await expect(createInvite(db, member.id, team.id, {})).rejects.toThrow(/Only team admins/);
    await expect(listInvites(db, member.id, team.id)).rejects.toThrow(/Only team admins/);
    await expect(changeRole(db, member.id, team.id, member.id, "admin")).rejects.toThrow(/Only team admins/);
    await expect(removeMember(db, member.id, team.id, admin.id)).rejects.toThrow(/Only team admins/);
    await changeRole(db, admin.id, team.id, member.id, "admin");
    expect((await requireMembership(db, member.id, team.id)).role).toBe("admin");
  });

  it("protects the last admin", async () => {
    const admin = await makeUser(db);
    const team = await createTeam(db, admin.id, { name: "Team T", timezone: "UTC" });
    await expect(changeRole(db, admin.id, team.id, admin.id, "member")).rejects.toThrow(/at least one admin/);
    await expect(removeMember(db, admin.id, team.id, admin.id)).rejects.toThrow(/last admin/);
  });

  it("denies every team read to non-members", async () => {
    const a = await makeUser(db);
    const b = await makeUser(db);
    const teamA = await createTeam(db, a.id, { name: "Team A", timezone: "UTC" });
    await createTeam(db, b.id, { name: "Team B", timezone: "UTC" });
    await expect(listMembers(db, b.id, teamA.id)).rejects.toThrow(/not a member/);
    await expect(requireMembership(db, b.id, "not-a-uuid")).rejects.toThrow();
  });
});
