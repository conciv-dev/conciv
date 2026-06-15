import {type H3, HTTPError, readValidatedBody} from 'h3'
import {chat, EventType, toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import {harnessText} from '@aidx/harness'
import type {HarnessAdapter, HarnessChild} from '@aidx/protocol/harness-types'
import {UiSpecSchema} from '@aidx/protocol/ui-types'
import {ChatRequestSchema} from '@aidx/protocol/chat-types'
import {tokenUsageToSnapshot} from '@aidx/protocol/usage-types'
import {acquireLock, readLock, releaseLock} from '../../store/lock.js'
import {writeSession} from '../../store/session-store.js'
import {writeUsage} from '../../store/usage-store.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import {toChatMessages} from './messages.js'
import type {SessionState} from './session.js'
import {sseHeaders} from '../sse.js'

export type SpawnHarness = (args: string[], cwd: string) => HarnessChild

export type TurnDeps = {
  cwd: string
  stateRoot: string
  previewId: string
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
  state: SessionState
}

// The live-turn routes, both uiBus consumers:
//   POST /api/chat/ui → inject agent generative UI onto the live turn (non-blocking)
//   POST /api/chat    → stream a turn (409 if the lock is held)
export function registerTurnRoutes(app: H3, deps: TurnDeps): void {
  const {harness, uiBus, state} = deps

  app.post('/api/chat/ui', async (event) => {
    const spec = await readValidatedBody(event, UiSpecSchema)
    return {renderId: spec.renderId, injected: uiBus.inject(spec)}
  })

  app.post('/api/chat', async (event) => {
    if (readLock(deps.stateRoot).held) throw new HTTPError({status: 409, message: 'agent busy'})
    const chatReq = await readValidatedBody(event, ChatRequestSchema)
    const resumeSessionId = harness.capabilities.resume ? chatReq.sessionId || state.sessionId || null : null
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    // systemPrompt delivery by capability: 'file' → the written path; 'flag'/'none' → raw text.
    const mode = harness.capabilities.systemPrompt
    const sysText = mode === 'file' ? (deps.systemPromptFile ?? '') : (deps.systemPromptText ?? '')
    const abort = new AbortController()

    const adapter = harnessText(harness, {
      cwd: deps.cwd,
      spawnHarness: deps.spawnHarness,
      systemPrompt: sysText,
      resumeSessionId,
      permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
      mcpUrl: harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined,
      onSessionId: (id) => {
        state.sessionId = id
        writeSession(deps.stateRoot, deps.previewId, id)
      },
      // Live usage: inject mid-turn so the widget's tracker fills as the turn streams.
      onUsage: (usage) => uiBus.injectUsage(usage),
      onSpawn: (child) => {
        acquireLock(deps.stateRoot, 'chat', child.pid)
        event.req.signal.addEventListener('abort', () => {
          abort.abort()
          child.kill()
        })
      },
    })

    const stream = chat({
      adapter,
      messages: toChatMessages(chatReq),
      systemPrompts: sysText ? [sysText] : [],
      abortController: abort,
    })
    const merged = uiBus.run(stream)
    const sse = toServerSentEventsStream(withLockRelease(merged, deps), abort)
    return new Response(sse, {status: 200, headers: sseHeaders(event)})
  })
}

// Persist RUN_FINISHED usage (so the tracker fills on the next open) and release the lock when
// the turn's merged stream finishes OR the client disconnects.
async function* withLockRelease(src: AsyncIterable<StreamChunk>, deps: TurnDeps): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) {
      if (c.type === EventType.RUN_FINISHED && c.usage && deps.state.sessionId) {
        writeUsage(deps.stateRoot, deps.state.sessionId, tokenUsageToSnapshot(c.usage))
      }
      yield c
    }
  } finally {
    releaseLock(deps.stateRoot)
  }
}
