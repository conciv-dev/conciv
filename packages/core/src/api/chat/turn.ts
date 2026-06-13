import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {type H3, readValidatedBody} from 'h3'
import {toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import type {HarnessAdapter, HarnessChild} from '@devgent/protocol/harness-types'
import {UiSpecSchema} from '@devgent/protocol/ui-types'
import {ChatRequestSchema} from '@devgent/protocol/chat-types'
import {acquireLock, readLock, releaseLock} from '../../chat/lock.js'
import {writeSession} from '../../chat/session-store.js'
import type {UiBus} from '../../chat/ui-bus.js'
import {lastUserText} from './messages.js'
import type {SessionState} from './session.js'

export type SpawnHarness = (args: string[], cwd: string) => HarnessChild

export type TurnDeps = {
  cwd: string
  lockDir: string
  previewId: string
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
  state: SessionState
}

// Turn a child's stdout into an async iterable of lines.
async function* linesOf(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of rl) yield line
}

// Release the lock when the turn's merged stream finishes OR the client disconnects.
async function* withLockRelease(src: AsyncIterable<StreamChunk>, lockDir: string): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) yield c
  } finally {
    releaseLock(lockDir)
  }
}

// The live-turn routes, both uiBus consumers:
//   POST /api/chat/ui → inject agent generative UI onto the live turn (non-blocking)
//   POST /api/chat    → stream a turn (409 if the lock is held)
export function registerTurnRoutes(app: H3, deps: TurnDeps): void {
  const {harness, uiBus, state} = deps

  app.post('/api/chat/ui', async (event) => {
    // readValidatedBody auto-400s on an invalid spec — no manual guard, no cast.
    const spec = await readValidatedBody(event, UiSpecSchema)
    return {renderId: spec.renderId, injected: uiBus.inject(spec)}
  })

  app.post('/api/chat', async (event) => {
    if (readLock(deps.lockDir).held) {
      event.res.status = 409
      return {error: 'agent busy'}
    }
    const chat = await readValidatedBody(event, ChatRequestSchema)
    const resumeSessionId = harness.capabilities.resume ? chat.sessionId || state.sessionId || null : null
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    const systemPrompt =
      harness.capabilities.systemPrompt === 'file' ? (deps.systemPromptFile ?? '') : (deps.systemPromptText ?? '')
    const args = harness.buildArgs({
      prompt: lastUserText(chat),
      cwd: deps.cwd,
      resumeSessionId,
      systemPrompt,
      permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
    })
    const child = deps.spawnHarness(args, deps.cwd)
    acquireLock(deps.lockDir, 'chat', child.pid)
    const abort = new AbortController()
    event.req.signal.addEventListener('abort', () => {
      abort.abort()
      child.kill()
    })
    // harness.decode → AG-UI events → uiBus merge → TanStack's web ReadableStream SSE encoder.
    // The handler RETURNS the web stream directly — no Readable.fromWeb, no pipeline, no cast.
    const events = harness.decode(linesOf(child.stdout), {
      onSessionId: (id) => {
        state.sessionId = id
        writeSession(deps.lockDir, deps.previewId, id)
      },
    })
    const merged = uiBus.run(events)
    const sse = toServerSentEventsStream(withLockRelease(merged, deps.lockDir), abort)
    return new Response(sse, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'access-control-allow-origin': '*',
      },
    })
  })
}
