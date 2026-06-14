import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {type H3, HTTPError, readValidatedBody} from 'h3'
import {toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import type {HarnessAdapter, HarnessChild} from '@aidx/protocol/harness-types'
import {UiSpecSchema} from '@aidx/protocol/ui-types'
import {ChatRequestSchema} from '@aidx/protocol/chat-types'
import {acquireLock, readLock, releaseLock} from '../../store/lock.js'
import {writeSession} from '../../store/session-store.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import {lastUserText} from './messages.js'
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
    const chat = await readValidatedBody(event, ChatRequestSchema)
    const resumeSessionId = harness.capabilities.resume ? chat.sessionId || state.sessionId || null : null
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    // systemPrompt delivery by capability: 'file' → the written path; 'flag' → raw text passed to
    // buildArgs; 'none' → no channel, so prepend it to the first prompt instead.
    const mode = harness.capabilities.systemPrompt
    const sysText = mode === 'file' ? (deps.systemPromptFile ?? '') : (deps.systemPromptText ?? '')
    const userText = lastUserText(chat)
    const args = harness.buildArgs({
      prompt: mode === 'none' && sysText ? `${sysText}\n\n${userText}` : userText,
      cwd: deps.cwd,
      resumeSessionId,
      systemPrompt: mode === 'none' ? '' : sysText,
      permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
    })
    const child = deps.spawnHarness(args, deps.cwd)
    acquireLock(deps.stateRoot, 'chat', child.pid)
    const abort = new AbortController()
    event.req.signal.addEventListener('abort', () => {
      abort.abort()
      child.kill()
    })
    // harness.decode → uiBus merge → web ReadableStream SSE, returned directly.
    const events = harness.decode(linesOf(child.stdout), {
      onSessionId: (id) => {
        state.sessionId = id
        writeSession(deps.stateRoot, deps.previewId, id)
      },
    })
    const merged = uiBus.run(events)
    const sse = toServerSentEventsStream(withLockRelease(merged, deps.stateRoot), abort)
    return new Response(sse, {status: 200, headers: sseHeaders(event)})
  })
}

// Turn a child's stdout into an async iterable of lines.
async function* linesOf(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of rl) yield line
}

// Release the lock when the turn's merged stream finishes OR the client disconnects.
async function* withLockRelease(src: AsyncIterable<StreamChunk>, stateRoot: string): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) yield c
  } finally {
    releaseLock(stateRoot)
  }
}
