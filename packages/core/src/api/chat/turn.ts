import {type H3, HTTPError, readValidatedBody} from 'h3'
import {chat, EventType, toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import {harnessText} from '@aidx/harness'
import type {HarnessAdapter, HarnessChild} from '@aidx/protocol/harness-types'
import {UiSpecSchema} from '@aidx/protocol/ui-types'
import {ChatRequestSchema} from '@aidx/protocol/chat-types'
import {tokenUsageToSnapshot} from '@aidx/protocol/usage-types'
import {acquireLock, releaseLock, updateLockPid} from '../../store/lock.js'
import type {SessionStore} from '../../store/session-store.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import {toChatMessages} from './messages.js'
import {sessionIdFromHeaders} from './session-id.js'
import {sseHeaders} from '../sse.js'

// The harness resume token stored on our record (null = never run), and the writer that persists it
// when the harness mints its id mid-turn. The only session bits the turn touches on the store.
export const resumeTokenFor = async (store: SessionStore, id: string): Promise<string | null> =>
  (await store.get(id))?.harnessSessionId ?? null
export const recordMintedToken = (store: SessionStore, id: string, token: string): Promise<unknown> =>
  store.update(id, {harnessSessionId: token})

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
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
  store: SessionStore
}

// The live-turn routes, both uiBus consumers:
//   POST /api/chat/ui → inject agent generative UI onto the live turn (non-blocking)
//   POST /api/chat    → stream a turn (409 if THIS session's lock is held; distinct sessions parallel)
export function registerTurnRoutes(app: H3, deps: TurnDeps): void {
  const {harness, uiBus} = deps

  app.post('/api/chat/ui', async (event) => {
    const spec = await readValidatedBody(event, UiSpecSchema)
    const sessionId = sessionIdFromHeaders(event.req.headers)
    return {renderId: spec.renderId, injected: sessionId ? uiBus.inject(sessionId, spec) : false}
  })

  app.post('/api/chat', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers) // our id; client always resolves first
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session (resolve first)'})
    // Atomic acquire IS the guard — closes the check-then-act race two same-session turns could hit.
    // Recorded pid is the dev-server's (alive for the run); released in the stream teardown's finally.
    if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) {
      throw new HTTPError({status: 409, message: 'session busy'})
    }
    // Any throw after a successful acquire but before the stream takes over its release (the
    // withLockRelease finally only covers the streaming path) must not leak the lock.
    try {
      const chatReq = await readValidatedBody(event, ChatRequestSchema)
      // intent rides the AG-UI envelope (forwardedProps/data) like model, with a top-level fallback.
      const intent = chatReq.intent ?? chatReq.forwardedProps?.intent ?? chatReq.data?.intent ?? 'chat'
      const turnKind = intent === 'compact' ? 'compact' : 'chat'
      const resumeSessionId = harness.capabilities.resume ? await resumeTokenFor(deps.store, sessionId) : null
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
          // Best-effort persist of the resume token; a failed write must not crash the live turn.
          void recordMintedToken(deps.store, sessionId, id).catch(() => {})
        },
        // Live usage: inject mid-turn so the widget's tracker fills as the turn streams.
        onUsage: (usage) => uiBus.injectUsage(sessionId, usage),
        // The lock is already held (acquired up front under the server pid). Re-point it at the child
        // so /api/chat/stop's process.kill signals the child, not the dev server. Then wire abort → kill.
        onSpawn: (child) => {
          if (child.pid) updateLockPid(deps.stateRoot, sessionId, 'chat', child.pid)
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
      const sse = toServerSentEventsStream(withLockRelease(merged, deps.store, deps.stateRoot, sessionId), abort)
      return new Response(sse, {status: 200, headers: sseHeaders(event)})
    } catch (e) {
      releaseLock(deps.stateRoot, sessionId)
      throw e
    }
  })
}

// Persist RUN_FINISHED usage onto our record (so the tracker fills on the next open) and release this
// session's lock when its merged stream finishes OR the client disconnects.
async function* withLockRelease(
  src: AsyncIterable<StreamChunk>,
  store: SessionStore,
  stateRoot: string,
  sessionId: string,
): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) {
      if (c.type === EventType.RUN_FINISHED && c.usage) {
        await store.update(sessionId, {usage: tokenUsageToSnapshot(c.usage)})
      }
      yield c
    }
  } finally {
    releaseLock(stateRoot, sessionId)
  }
}
