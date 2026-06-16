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
import type {SessionLookup} from './session.js'
import {sessionIdFromHeaders} from './session-id.js'
import {sseHeaders} from '../sse.js'

// The optional sessionId becomes AIDX_SESSION_ID in the child's env, so the agent's `aidx ui` /
// permission-hook calls echo it back and core routes them to this turn's channel.
export type SpawnHarness = (args: string[], cwd: string, sessionId?: string) => HarnessChild

// Sent in place of '/compact' to harnesses without native compaction — best-effort summary (it does
// not free the resumed context, but gives the user a recap below the boundary divider).
const COMPACT_FALLBACK_PROMPT =
  'Summarize our conversation so far as concisely as you can: the key decisions, the current state, and any open threads, so we can continue with less context.'

export type TurnDeps = {
  cwd: string
  stateRoot: string
  previewId: string
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
  sessionFor: SessionLookup
}

// The live-turn routes, both uiBus consumers:
//   POST /api/chat/ui → inject agent generative UI onto the live turn (non-blocking)
//   POST /api/chat    → stream a turn (409 if THIS session's lock is held; distinct sessions parallel)
export function registerTurnRoutes(app: H3, deps: TurnDeps): void {
  const {harness, uiBus} = deps

  app.post('/api/chat/ui', async (event) => {
    const spec = await readValidatedBody(event, UiSpecSchema)
    const sessionId = sessionIdFromHeaders(event.req.headers)
    return {renderId: spec.renderId, injected: uiBus.inject(sessionId, spec)}
  })

  app.post('/api/chat', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers) // header id (canonical)
    if (readLock(deps.stateRoot, sessionId).held) throw new HTTPError({status: 409, message: 'session busy'})
    const chatReq = await readValidatedBody(event, ChatRequestSchema)
    // intent rides the AG-UI envelope (forwardedProps/data) like model, with a top-level fallback.
    const intent = chatReq.intent ?? chatReq.forwardedProps?.intent ?? chatReq.data?.intent ?? 'chat'
    const turnKind = intent === 'compact' ? 'compact' : 'chat'
    const session = deps.sessionFor(sessionId)
    const resumeSessionId = harness.capabilities.resume ? session.harnessSessionId || null : null
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    // systemPrompt delivery by capability: 'file' → the written path; 'flag'/'none' → raw text.
    const mode = harness.capabilities.systemPrompt
    const sysText = mode === 'file' ? (deps.systemPromptFile ?? '') : (deps.systemPromptText ?? '')
    const abort = new AbortController()

    const adapter = harnessText(harness, {
      cwd: deps.cwd,
      // Bind this turn's header id into the spawn so the child env carries AIDX_SESSION_ID.
      spawnHarness: (args, cwd) => deps.spawnHarness(args, cwd, sessionId),
      systemPrompt: sysText,
      resumeSessionId,
      permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
      mcpUrl: harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined,
      // The widget's model rides the AG-UI envelope (forwardedProps/data), not top-level.
      model: chatReq.model ?? chatReq.forwardedProps?.model ?? chatReq.data?.model,
      turnKind,
      onSessionId: (id) => {
        session.harnessSessionId = id
        writeSession(deps.stateRoot, deps.previewId, sessionId, id)
      },
      // Live usage: inject mid-turn so the widget's tracker fills as the turn streams.
      onUsage: (usage) => uiBus.injectUsage(sessionId, usage),
      onSpawn: (child) => {
        acquireLock(deps.stateRoot, sessionId, 'chat', child.pid)
        event.req.signal.addEventListener('abort', () => {
          abort.abort()
          child.kill()
        })
      },
    })

    // Compaction fallback: the widget posts '/compact' as the user text. A compaction-capable
    // harness ignores it (its buildCompactArgs hardcodes the native command); a non-capable one gets
    // a real summarize instruction substituted here, so the turn still yields a usable summary.
    const messages = toChatMessages(chatReq)
    if (turnKind === 'compact' && !harness.capabilities.compaction) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      if (lastUser) lastUser.content = COMPACT_FALLBACK_PROMPT
    }

    const stream = chat({
      adapter,
      messages,
      systemPrompts: sysText ? [sysText] : [],
      abortController: abort,
    })
    const merged = uiBus.run(sessionId, stream)
    const sse = toServerSentEventsStream(withLockRelease(merged, deps.stateRoot, sessionId), abort)
    return new Response(sse, {status: 200, headers: sseHeaders(event)})
  })
}

// Persist RUN_FINISHED usage (keyed on the header id so the tracker fills on the next open) and
// release this session's lock when its merged stream finishes OR the client disconnects.
async function* withLockRelease(
  src: AsyncIterable<StreamChunk>,
  stateRoot: string,
  sessionId: string,
): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) {
      if (c.type === EventType.RUN_FINISHED && c.usage) {
        writeUsage(stateRoot, sessionId, tokenUsageToSnapshot(c.usage))
      }
      yield c
    }
  } finally {
    releaseLock(stateRoot, sessionId)
  }
}
