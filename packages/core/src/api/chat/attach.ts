import {type StreamChunk} from '@tanstack/ai'
import type {ChatHistory} from '@conciv/protocol/chat-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import type {ChatRuntime} from './chat-env.js'
import {readFileOrEmpty} from '../../fs.js'
import {settledMessages, userText} from './settled-history.js'

export async function transcriptMessages(deps: ChatRuntime, sessionId: string): Promise<ChatHistory> {
  if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
  const record = await deps.store.get(sessionId)
  if (!record?.harnessSessionId) return []
  const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId, deps.claudeHome))
  return jsonl ? deps.harness.history.parse(jsonl) : []
}

export async function attachStream(
  deps: ChatRuntime,
  sessionId: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamChunk>> {
  const history = await transcriptMessages(deps, sessionId)
  const pending = deps.hub.pendingUserMessage(sessionId)
  const {replay, live} = deps.hub.attach(sessionId, signal)
  const settled = settledMessages(history, pending ? userText(pending) : null)
  const messages = pending ? [...settled, pending] : settled
  async function* chunks(): AsyncGenerator<StreamChunk> {
    yield aguiSnapshotFor(messages)
    yield* replay
    yield* live
  }
  return chunks()
}
