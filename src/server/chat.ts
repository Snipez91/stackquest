import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getMission } from "@/content";
import type { Db } from "./db";
import { channelReads, channels, memberships, messages, notifications, users } from "./db/schema";
import { AppError, forbidden, notFound, rowsOf } from "./errors";
import { enforceRateLimit, RateLimitError } from "./ratelimit";
import { publish } from "./realtime";
import { requireMembership } from "./teams";

export const MESSAGE_MAX = 4000;

export type ChatMessage = {
  id: string;
  channelId: string;
  userId: string;
  displayName: string;
  handle: string;
  avatarHue: number;
  body: string;
  clientId: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
};

async function channelForMember(db: Db, userId: string, channelId: string) {
  if (!z.string().uuid().safeParse(channelId).success) throw notFound("Channel not found.");
  const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!ch) throw notFound("Channel not found.");
  const membership = await requireMembership(db, userId, ch.teamId);
  return { ch, membership };
}

export async function listChannels(db: Db, userId: string, teamId: string) {
  await requireMembership(db, userId, teamId);
  const [me] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, userId));
  const rows = rowsOf<{ id: string; kind: string; key: string; name: string; unread: number; mentions: number; last_at: string | null }>(
    await db.execute(sql`
      select c.id, c.kind, c.key, c.name,
        (select count(*)::int from ${messages} m where m.channel_id = c.id and m.deleted_at is null and m.user_id <> ${userId}
           and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)) as unread,
        (select count(*)::int from ${messages} m where m.channel_id = c.id and m.deleted_at is null and m.user_id <> ${userId}
           and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz) and m.body ilike ${"%@" + me.handle + "%"}) as mentions,
        (select max(created_at) from ${messages} m where m.channel_id = c.id) as last_at
      from ${channels} c
      left join ${channelReads} r on r.channel_id = c.id and r.user_id = ${userId}
      where c.team_id = ${teamId}
      order by case c.kind when 'general' then 0 when 'track' then 1 else 2 end, last_at desc nulls last, c.name`),
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind as "general" | "track" | "mission", key: r.key, name: r.name, unread: Number(r.unread), mentions: Number(r.mentions), lastAt: r.last_at }));
}

export async function ensureMissionChannel(db: Db, userId: string, teamId: string, slug: string) {
  await requireMembership(db, userId, teamId);
  const m = getMission(slug);
  if (!m) throw notFound("Mission not found.");
  await db.insert(channels).values({ teamId, kind: "mission", key: slug, name: m.title }).onConflictDoNothing();
  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.teamId, teamId), eq(channels.kind, "mission"), eq(channels.key, slug)));
  return ch;
}

const msgSelect = {
  id: messages.id,
  channelId: messages.channelId,
  userId: messages.userId,
  displayName: users.displayName,
  handle: users.handle,
  avatarHue: users.avatarHue,
  body: messages.body,
  clientId: messages.clientId,
  createdAt: messages.createdAt,
  editedAt: messages.editedAt,
  deletedAt: messages.deletedAt,
};

function toChat(r: { id: string; channelId: string; userId: string; displayName: string; handle: string; avatarHue: number; body: string; clientId: string; createdAt: Date; editedAt: Date | null; deletedAt: Date | null }): ChatMessage {
  return {
    id: r.id,
    channelId: r.channelId,
    userId: r.userId,
    displayName: r.displayName,
    handle: r.handle,
    avatarHue: r.avatarHue,
    body: r.deletedAt ? "" : r.body,
    clientId: r.clientId,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    deleted: !!r.deletedAt,
  };
}

export async function listMessages(db: Db, userId: string, channelId: string, opts: { before?: string; after?: string; limit?: number } = {}) {
  const { ch } = await channelForMember(db, userId, channelId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const conds = [eq(messages.channelId, ch.id)];
  if (opts.before) conds.push(lt(messages.createdAt, new Date(opts.before)));
  if (opts.after) conds.push(gt(messages.createdAt, new Date(opts.after)));
  const rows = await db
    .select(msgSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(and(...conds))
    .orderBy(opts.after ? asc(messages.createdAt) : desc(messages.createdAt))
    .limit(limit);
  const list = rows.map(toChat);
  return { channel: ch, messages: opts.after ? list : list.reverse(), hasMore: rows.length === limit };
}

const PostSchema = z.object({
  body: z.string().transform((s) => s.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()).pipe(z.string().min(1, "Message is empty.").max(MESSAGE_MAX, `Messages are limited to ${MESSAGE_MAX} characters.`)),
  clientId: z.string().min(8).max(64).regex(/^[\w-]+$/),
});

async function limited(db: Db, key: string, n: number, secs: number) {
  try {
    await enforceRateLimit(db, key, n, secs);
  } catch (e) {
    if (e instanceof RateLimitError) throw new AppError("rate_limited", `You're sending messages quickly. ${e.message}`);
    throw e;
  }
}

export async function postMessage(db: Db, userId: string, channelId: string, input: { body: string; clientId: string }): Promise<{ message: ChatMessage; duplicate: boolean }> {
  const { ch, membership } = await channelForMember(db, userId, channelId);
  const p = PostSchema.safeParse(input);
  if (!p.success) throw new AppError("bad_request", p.error.issues[0].message);
  // Retries with the same clientId return the original message: no duplicates.
  const [existing] = await db
    .select(msgSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(and(eq(messages.userId, userId), eq(messages.clientId, p.data.clientId)))
    .limit(1);
  if (existing) {
    if (existing.channelId !== ch.id) throw new AppError("conflict", "Duplicate message id.");
    return { message: toChat(existing), duplicate: true };
  }
  if (membership.mutedUntil && membership.mutedUntil.getTime() > Date.now()) {
    throw forbidden(`A team admin has paused your messages until ${membership.mutedUntil.toUTCString()}.`);
  }
  await limited(db, `chat:burst:${userId}`, 8, 10);
  await limited(db, `chat:hour:${userId}`, 200, 3600);

  const inserted = await db
    .insert(messages)
    .values({ channelId: ch.id, teamId: ch.teamId, userId, body: p.data.body, clientId: p.data.clientId })
    .onConflictDoNothing()
    .returning({ id: messages.id });
  const id = inserted[0]?.id;
  const [row] = await db
    .select(msgSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(id ? eq(messages.id, id) : and(eq(messages.userId, userId), eq(messages.clientId, p.data.clientId)));
  const message = toChat(row);
  if (!id) return { message, duplicate: true };

  await db
    .insert(channelReads)
    .values({ userId, channelId: ch.id, lastReadAt: row.createdAt })
    .onConflictDoUpdate({ target: [channelReads.userId, channelReads.channelId], set: { lastReadAt: row.createdAt } });

  // Mentions: @handle of a current teammate creates a notification.
  const handles = [...new Set([...p.data.body.matchAll(/(?:^|[^\w@])@([a-z0-9]{2,24})\b/gi)].map((m) => m[1].toLowerCase()))];
  if (handles.length) {
    const targets = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.teamId, ch.teamId)))
      .where(inArray(users.handle, handles));
    const others = targets.filter((t) => t.id !== userId);
    if (others.length) {
      await db.insert(notifications).values(
        others.map((t) => ({ userId: t.id, teamId: ch.teamId, kind: "mention" as const, payload: { channelId: ch.id, channelName: ch.name, messageId: message.id, from: message.displayName } })),
      );
    }
  }
  publish({ teamId: ch.teamId, type: "message.created", data: { message } });
  return { message, duplicate: false };
}

export async function editMessage(db: Db, userId: string, messageId: string, body: string) {
  if (!z.string().uuid().safeParse(messageId).success) throw notFound("Message not found.");
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!m || m.deletedAt) throw notFound("Message not found.");
  await requireMembership(db, userId, m.teamId);
  if (m.userId !== userId) throw forbidden("You can only edit your own messages.");
  const p = PostSchema.shape.body.safeParse(body);
  if (!p.success) throw new AppError("bad_request", p.error.issues[0].message);
  await db.update(messages).set({ body: p.data, editedAt: new Date() }).where(eq(messages.id, messageId));
  const [row] = await db.select(msgSelect).from(messages).innerJoin(users, eq(users.id, messages.userId)).where(eq(messages.id, messageId));
  const message = toChat(row);
  publish({ teamId: m.teamId, type: "message.updated", data: { message } });
  return message;
}

export async function deleteMessage(db: Db, userId: string, messageId: string) {
  if (!z.string().uuid().safeParse(messageId).success) throw notFound("Message not found.");
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!m || m.deletedAt) throw notFound("Message not found.");
  const membership = await requireMembership(db, userId, m.teamId);
  if (m.userId !== userId && membership.role !== "admin") throw forbidden("Only the author or a team admin can delete this message.");
  // Soft delete: the body is wiped so content is gone, the placeholder keeps threads readable.
  await db.update(messages).set({ deletedAt: new Date(), deletedBy: userId, body: "" }).where(eq(messages.id, messageId));
  publish({ teamId: m.teamId, type: "message.deleted", data: { id: m.id, channelId: m.channelId } });
}

export async function markRead(db: Db, userId: string, channelId: string) {
  const { ch } = await channelForMember(db, userId, channelId);
  const now = new Date();
  await db
    .insert(channelReads)
    .values({ userId, channelId: ch.id, lastReadAt: now })
    .onConflictDoUpdate({ target: [channelReads.userId, channelReads.channelId], set: { lastReadAt: now } });
}

export async function touchPresence(db: Db, userId: string, teamId: string) {
  await db
    .update(memberships)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)));
}

export async function onlineMembers(db: Db, userId: string, teamId: string) {
  await requireMembership(db, userId, teamId);
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.teamId, teamId), gt(memberships.lastSeenAt, new Date(Date.now() - 75_000))));
  return rows.map((r) => r.userId);
}

export async function unreadTotals(db: Db, userId: string, teamId: string) {
  const chans = await listChannels(db, userId, teamId);
  return { unread: chans.reduce((s, c) => s + c.unread, 0), mentions: chans.reduce((s, c) => s + c.mentions, 0) };
}
