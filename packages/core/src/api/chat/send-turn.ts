import {ChatMessageSchema, type ChatMessage} from '@conciv/protocol/chat-types'
import type {UiState} from '@conciv/db'
import {acquireLock, releaseLock} from '../../store/lock.js'
import type {ChatRuntime} from './chat-env.js'
import {SESSION_BUSY} from './compact.js'
import {transcriptMessages} from './attach.js'
import {ensureChatRecord, resumableToken, resumeTokenFor, startTurn} from './turn.js'

async function composeUserText(uiState: UiState, sessionId: string, text: string): Promise<string> {
  const draft = await uiState.getDraft(sessionId)
  const grabs = draft?.grabs ?? []
  return grabs.length === 0 ? text : `${grabs.join('\n')}\n${text}`
}

async function historyFor(chat: ChatRuntime, sessionId: string): Promise<ChatMessage[]> {
  const resumable =
    chat.harness.capabilities.resume &&
    resumableToken(chat.harness, chat.cwd, await resumeTokenFor(chat.store, sessionId), chat.claudeHome) !== null
  if (resumable) return []
  return (await transcriptMessages(chat, sessionId)).map((message) => ChatMessageSchema.parse(message))
}

export function makeSendTurn(chat: ChatRuntime, uiState: UiState): (sessionId: string, text: string) => Promise<void> {
  return async (sessionId, text) => {
    if (chat.hub.generating(sessionId)) throw new Error(SESSION_BUSY)
    if (!acquireLock(chat.stateRoot, sessionId, 'chat', process.pid)) throw new Error(SESSION_BUSY)
    try {
      chat.onTurnStart?.(sessionId)
      await ensureChatRecord(chat.store, sessionId, chat.harness.id, chat.cwd)
      const userText = await composeUserText(uiState, sessionId, text)
      const model = (await chat.store.get(sessionId))?.model ?? undefined
      const history = await historyFor(chat, sessionId)
      await startTurn(chat, sessionId, {
        messages: [...history, {role: 'user', content: userText}],
        ...(model ? {forwardedProps: {model}} : {}),
      })
      await uiState.clearDraft(sessionId)
    } catch (error) {
      releaseLock(chat.stateRoot, sessionId)
      throw error
    }
  }
}
