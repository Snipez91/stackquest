import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { deleteMessage, editMessage, ensureMissionChannel, listChannels, listMessages, markRead, postMessage } from "@/server/chat";
import { subscribe, type RealtimeEvent } from "@/server/realtime";
import { acceptInvite, createInvite, createTeam, muteMember } from "@/server/teams";
import { missions } from "@/content";
import { makeUser, testDb } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

async function twoMemberTeam() {
  const admin = await makeUser(db, "Admin");
  const team = await createTeam(db, admin.id, { name: "Chat Team", timezone: "UTC" });
  const { token } = await createInvite(db, admin.id, team.id, { maxUses: 5 });
  const member = await makeUser(db, "Member");
  await acceptInvite(db, member.id, token);
  const general = (await listChannels(db, admin.id, team.id)).find((c) => c.kind === "general")!;
  return { admin, member, team, general };
}

describe("chat", () => {
  it("persists messages and lists them in order", async () => {
    const { admin, member, general } = await twoMemberTeam();
    await postMessage(db, admin.id, general.id, { body: "first", clientId: "client-aaa-1" });
    await postMessage(db, member.id, general.id, { body: "second", clientId: "client-bbb-1" });
    const r = await listMessages(db, member.id, general.id);
    expect(r.messages.map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("dedupes retries that reuse the client id (reconnect without duplicates)", async () => {
    const { admin, general } = await twoMemberTeam();
    const a = await postMessage(db, admin.id, general.id, { body: "hello", clientId: "retry-123456" });
    const b = await postMessage(db, admin.id, general.id, { body: "hello", clientId: "retry-123456" });
    expect(b.duplicate).toBe(true);
    expect(b.message.id).toBe(a.message.id);
    expect((await listMessages(db, admin.id, general.id)).messages).toHaveLength(1);
  });

  it("fills a gap after reconnect via the `after` cursor", async () => {
    const { admin, member, general } = await twoMemberTeam();
    const m1 = await postMessage(db, admin.id, general.id, { body: "before drop", clientId: "gap-000001" });
    await new Promise((r) => setTimeout(r, 5));
    await postMessage(db, admin.id, general.id, { body: "while offline", clientId: "gap-000002" });
    const r = await listMessages(db, member.id, general.id, { after: m1.message.createdAt });
    expect(r.messages.map((m) => m.body)).toEqual(["while offline"]);
  });

  it("blocks non-members from reading and posting", async () => {
    const { general } = await twoMemberTeam();
    const outsider = await makeUser(db, "Outsider");
    await createTeam(db, outsider.id, { name: "Other Team", timezone: "UTC" });
    await expect(listMessages(db, outsider.id, general.id)).rejects.toThrow(/not a member/);
    await expect(postMessage(db, outsider.id, general.id, { body: "hi", clientId: "outsider-01" })).rejects.toThrow(/not a member/);
    await expect(markRead(db, outsider.id, general.id)).rejects.toThrow(/not a member/);
  });

  it("validates length and strips control characters", async () => {
    const { admin, general } = await twoMemberTeam();
    await expect(postMessage(db, admin.id, general.id, { body: "   ", clientId: "empty-0001" })).rejects.toThrow(/empty/);
    await expect(postMessage(db, admin.id, general.id, { body: "x".repeat(4001), clientId: "long-00001" })).rejects.toThrow(/limited/);
    const r = await postMessage(db, admin.id, general.id, { body: "a\u0007b <script>", clientId: "ctrl-00001" });
    expect(r.message.body).toBe("ab <script>"); // stored as text; rendered as text nodes, never HTML
  });

  it("lets authors edit; authors or admins delete; nobody else", async () => {
    const { admin, member, general } = await twoMemberTeam();
    const { message } = await postMessage(db, member.id, general.id, { body: "typo", clientId: "edit-00001" });
    await expect(editMessage(db, admin.id, message.id, "hijack")).rejects.toThrow(/own messages/);
    expect((await editMessage(db, member.id, message.id, "fixed")).editedAt).toBeTruthy();
    const other = await postMessage(db, admin.id, general.id, { body: "admin msg", clientId: "edit-00002" });
    await expect(deleteMessage(db, member.id, other.message.id)).rejects.toThrow(/author or a team admin/);
    await deleteMessage(db, admin.id, message.id); // moderation
    const list = await listMessages(db, member.id, general.id);
    const del = list.messages.find((m) => m.id === message.id)!;
    expect(del.deleted).toBe(true);
    expect(del.body).toBe("");
  });

  it("rate-limits bursts and honours admin mutes", async () => {
    const { admin, member, team, general } = await twoMemberTeam();
    for (let i = 0; i < 8; i++) await postMessage(db, member.id, general.id, { body: `m${i}`, clientId: `burst-${i}-xxxx` });
    await expect(postMessage(db, member.id, general.id, { body: "one too many", clientId: "burst-9-xxxx" })).rejects.toThrow(/quickly/);
    await muteMember(db, admin.id, team.id, member.id, 60);
    await expect(postMessage(db, member.id, general.id, { body: "muted", clientId: "muted-00001" })).rejects.toThrow(/paused/);
  });

  it("creates mention notifications and unread counts", async () => {
    const { admin, member, general, team } = await twoMemberTeam();
    await postMessage(db, admin.id, general.id, { body: `ping @${member.handle} please`, clientId: "mention-001" });
    const n = await db.select().from(notifications).where(eq(notifications.userId, member.id));
    expect(n.filter((x) => x.kind === "mention")).toHaveLength(1);
    const ch = (await listChannels(db, member.id, team.id)).find((c) => c.id === general.id)!;
    expect(ch.unread).toBe(1);
    expect(ch.mentions).toBe(1);
    await markRead(db, member.id, general.id);
    expect((await listChannels(db, member.id, team.id)).find((c) => c.id === general.id)!.unread).toBe(0);
  });

  it("creates mission discussion threads on demand, scoped to the team", async () => {
    const { admin, member, team } = await twoMemberTeam();
    const ch = await ensureMissionChannel(db, admin.id, team.id, missions[0].slug);
    const again = await ensureMissionChannel(db, member.id, team.id, missions[0].slug);
    expect(again.id).toBe(ch.id);
    await expect(ensureMissionChannel(db, admin.id, team.id, "no-such-mission")).rejects.toThrow(/not found/i);
  });
});

describe("realtime isolation", () => {
  it("delivers events only to subscribers of the same team", async () => {
    const a = await twoMemberTeam();
    const otherAdmin = await makeUser(db);
    const other = await createTeam(db, otherAdmin.id, { name: "Elsewhere", timezone: "UTC" });
    const gotA: RealtimeEvent[] = [];
    const gotB: RealtimeEvent[] = [];
    const offA = subscribe(a.team.id, (e) => gotA.push(e));
    const offB = subscribe(other.id, (e) => gotB.push(e));
    await postMessage(db, a.admin.id, a.general.id, { body: "secret plan", clientId: "rt-0000001" });
    offA();
    offB();
    expect(gotA.some((e) => e.type === "message.created")).toBe(true);
    expect(gotB).toHaveLength(0);
  });
});
