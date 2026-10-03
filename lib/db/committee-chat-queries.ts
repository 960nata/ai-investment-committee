/**
 * Kueri riwayat percakapan Tanya Komite per pengguna.
 *
 * Seluruh fungsi yang mengakses data pengguna memfilter `userId` langsung
 * di tingkat kueri basis data untuk mencegah kebocoran antar-pengguna.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from './client'
import {
  committeeChatThread,
  committeeChatMessage,
  type CommitteeChatThreadRow,
  type CommitteeChatMessageRow,
} from './schema'

declare global {
  var __committeeChatTablesReady: boolean | undefined
}

export async function ensureCommitteeChatTables(): Promise<void> {
  if (globalThis.__committeeChatTablesReady) return

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS committee_chat_thread (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      topic VARCHAR(32) NOT NULL DEFAULT 'saham',
      symbol VARCHAR(32),
      market VARCHAR(32),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS committee_chat_message (
      id SERIAL PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES committee_chat_thread(id) ON DELETE CASCADE,
      role VARCHAR(16) NOT NULL,
      content TEXT NOT NULL,
      meta TEXT,
      sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      error BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS committee_chat_thread_user_idx
      ON committee_chat_thread (user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS committee_chat_message_thread_idx
      ON committee_chat_message (thread_id, created_at ASC);
  `)

  globalThis.__committeeChatTablesReady = true
}

export async function listUserChatThreads(
  userId: number,
  limit = 40,
): Promise<CommitteeChatThreadRow[]> {
  await ensureCommitteeChatTables()

  return db
    .select()
    .from(committeeChatThread)
    .where(eq(committeeChatThread.userId, userId))
    .orderBy(desc(committeeChatThread.updatedAt))
    .limit(limit)
}

export async function getUserChatThread(
  userId: number,
  threadId: number,
): Promise<{
  thread: CommitteeChatThreadRow
  messages: CommitteeChatMessageRow[]
} | null> {
  await ensureCommitteeChatTables()

  const [thread] = await db
    .select()
    .from(committeeChatThread)
    .where(and(eq(committeeChatThread.id, threadId), eq(committeeChatThread.userId, userId)))
    .limit(1)

  if (!thread) return null

  const messages = await db
    .select()
    .from(committeeChatMessage)
    .where(eq(committeeChatMessage.threadId, threadId))
    .orderBy(committeeChatMessage.createdAt)

  return { thread, messages }
}

export async function createUserChatThread(
  userId: number,
  data: {
    title: string
    topic?: string
    symbol?: string | null
    market?: string | null
  },
): Promise<CommitteeChatThreadRow> {
  await ensureCommitteeChatTables()

  const [created] = await db
    .insert(committeeChatThread)
    .values({
      userId,
      title: data.title.trim().slice(0, 200) || 'Percakapan Baru',
      topic: data.topic?.trim() || 'saham',
      symbol: data.symbol?.trim() || null,
      market: data.market?.trim() || null,
    })
    .returning()

  return created
}

export async function deleteUserChatThread(
  userId: number,
  threadId: number,
): Promise<boolean> {
  await ensureCommitteeChatTables()

  const deleted = await db
    .delete(committeeChatThread)
    .where(and(eq(committeeChatThread.id, threadId), eq(committeeChatThread.userId, userId)))
    .returning({ id: committeeChatThread.id })

  return deleted.length > 0
}

export async function addChatMessage(
  threadId: number,
  message: {
    role: 'user' | 'assistant'
    content: string
    meta?: string | null
    sources?: unknown[]
    error?: boolean
  },
): Promise<CommitteeChatMessageRow> {
  await ensureCommitteeChatTables()

  const [saved] = await db
    .insert(committeeChatMessage)
    .values({
      threadId,
      role: message.role,
      content: message.content,
      meta: message.meta ?? null,
      sources: message.sources ?? [],
      error: Boolean(message.error),
    })
    .returning()

  // Perbarui timestamp thread
  await db
    .update(committeeChatThread)
    .set({ updatedAt: new Date() })
    .where(eq(committeeChatThread.id, threadId))

  return saved
}
