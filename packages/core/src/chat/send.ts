import {eq} from 'drizzle-orm'
import {ChatMessageSchema, type ChatMessage} from '@conciv/protocol/chat-types'
import {claimRun, drafts, releaseRun, type ConcivDb} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {SESSION_BUSY} from './compact.js'
import {transcriptMessages} from './attach.js'
import {toModelMessages} from './history.js'
import {ensureChatRecord, resumableToken, resumeTokenFor, startRun} from './run.js'
import {sessionById} from './session.js'

async function composeUserText(db: ConcivDb, sessionId: string, text: string): Promise<string> {
  const rows = await db.select({grabs: drafts.grabs}).from(drafts).where(eq(drafts.sessionId, sessionId))
  const grabs = rows[0]?.grabs ?? []
  return grabs.length === 0 ? text : `${grabs.join('\n')}\n${text}`
}

async function historyFor(deps: ChatDeps, sessionId: string): Promise<ChatMessage[]> {
  const resumable =
    deps.harness.capabilities.resume &&
    resumableToken(deps.harness, deps.cwd, await resumeTokenFor(deps.db, sessionId), deps.claudeHome) !== null
  if (resumable) return []
  return (await transcriptMessages(deps, sessionId)).map((message) => ChatMessageSchema.parse(message))
}

export function makeSend(deps: ChatDeps): (sessionId: string, text: string) => Promise<void> {
  return async (sessionId, text) => {
    if (!claimRun(deps.db, sessionId, 'chat')) throw new Error(SESSION_BUSY)
    deps.changes.notify()
    try {
      deps.onRunStart?.(sessionId)
      await ensureChatRecord(deps.db, sessionId, deps.harness.id, deps.cwd)
      const userText = await composeUserText(deps.db, sessionId, text)
      const model = (await sessionById(deps.db, sessionId))?.model ?? null
      const history = await historyFor(deps, sessionId)
      const messages = toModelMessages([...history, {role: 'user', content: userText}])
      void startRun(deps, sessionId, {messages, model, kind: 'chat'})
      await deps.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      deps.changes.notify()
    } catch (error) {
      releaseRun(deps.db, sessionId, null)
      deps.changes.notify()
      throw error
    }
  }
}
