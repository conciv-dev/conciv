import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {ChatHistory} from '@conciv/protocol/chat-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import type {SessionStore} from '../../store/session-store.js'
import type {TurnHub} from '../../runtime/turn-hub.js'
import {readFileOrEmpty} from '../../fs.js'
import {sessionIdFromHeaders} from './session-id.js'
import {settledMessages, userText} from './settled-history.js'

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
}

export type AttachDeps = {
  cwd: string
  harness: HarnessAdapter
  store: SessionStore
  hub: TurnHub
  claudeHome?: string
}

async function transcriptMessages(deps: AttachDeps, sessionId: string): Promise<ChatHistory> {
  if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
  const record = await deps.store.get(sessionId)
  if (!record?.harnessSessionId) return []
  const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId, deps.claudeHome))
  return jsonl ? deps.harness.history.parse(jsonl) : []
}

export function makeAttachRoute(deps: AttachDeps) {
  return new Hono().get('/attach', async (c) => {
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    if (!sessionId) throw new HTTPException(400, {message: 'no session'})
    const abort = new AbortController()
    c.req.raw.signal.addEventListener('abort', () => abort.abort())
    const history = await transcriptMessages(deps, sessionId)
    const pending = deps.hub.pendingUserMessage(sessionId)
    const generating = deps.hub.generating(sessionId)
    const {replay, live} = deps.hub.attach(sessionId, abort.signal)
    const settled = settledMessages(history, pending ? userText(pending) : null)
    const messages = pending ? [...settled, pending] : settled
    async function* chunks(): AsyncGenerator<StreamChunk> {
      yield aguiSnapshotFor({generating, messages})
      yield* replay
      yield* live
    }
    return new Response(toServerSentEventsStream(chunks(), abort), {status: 200, headers: SSE_HEADERS})
  })
}
