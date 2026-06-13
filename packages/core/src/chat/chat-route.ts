import {readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {randomUUID} from 'node:crypto'
import {type H3, type H3Event, getQuery} from 'h3'
import {toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import type {HarnessAdapter, HarnessChild} from '@devgent/protocol/harness-types'
import {acquireLock, readLock, releaseLock} from './lock.js'
import {readSession, writeSession} from './session-store.js'
import {makeUiBus} from './ui-bus.js'
import {parseUiSpec} from '@devgent/protocol/ui-types'
import {bashDecision} from './risk.js'
import type {ChatRequest, ChatSession} from '@devgent/protocol/chat-types'

export type SpawnHarness = (args: string[], cwd: string) => HarnessChild

export type ChatRouteOpts = {
  cwd: string
  lockDir: string
  previewId: string // ties the persisted chat session to this preview (same preview → same chat)
  initialSessionId: string // the agent's session id, '' if none
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  // The system prompt the engine prepared: a file path when capabilities.systemPrompt==='file',
  // otherwise the raw text (the adapter decides how to apply it).
  systemPromptFile?: string
  systemPromptText?: string
  uiBus?: ReturnType<typeof makeUiBus> // shared so other routes can inject onto the live turn
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// Read + parse a JSON request body to `unknown` (narrow with guards at the use site — no cast).
async function readJsonBody(event: H3Event): Promise<unknown> {
  try {
    return await event.req.json()
  } catch {
    return undefined
  }
}

// Turn a child's stdout into an async iterable of lines.
async function* linesOf(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of rl) yield line
}

// Pull the latest user-turn text from the posted messages. Tolerant of both the parts-based
// UIMessage shape ({role, parts:[{type:'text', content}]}) and a plain {role, content: string}
// model message, since the transport may send either.
function lastUserText(req: ChatRequest): string {
  const users = req.messages.filter((m): m is Record<string, unknown> => isRecord(m) && m.role === 'user')
  const last = users.at(-1)
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  if (!Array.isArray(last.parts)) return ''
  return last.parts
    .filter((p): p is Record<string, unknown> => isRecord(p) && p.type === 'text' && typeof p.content === 'string')
    .map((p) => p.content)
    .join('\n')
}

function isChatRequest(v: unknown): v is ChatRequest {
  return isRecord(v) && Array.isArray(v.messages)
}

const APPROVAL_TIMEOUT_MS = 120_000

// Decide a PreToolUse Bash permission. Safe commands run; risky ones surface a confirm card in
// the chat (injected onto the live stream) and block until the user answers or we time out —
// fail closed. Non-Bash tools are allowed (edits are handled by acceptEdits).
async function decidePermission(
  toolName: string,
  toolInput: unknown,
  uiBus: ReturnType<typeof makeUiBus>,
  decisions: Map<string, (approved: boolean) => void>,
  timeoutMs = APPROVAL_TIMEOUT_MS,
): Promise<'allow' | 'deny'> {
  if (toolName !== 'Bash') return 'allow'
  const command = isRecord(toolInput) && typeof toolInput.command === 'string' ? toolInput.command : ''
  if (bashDecision(command) === 'allow') return 'allow'
  const renderId = randomUUID()
  const injected = uiBus.inject({kind: 'approval', renderId, question: 'Run this command?', detail: command})
  if (!injected) return 'deny' // no live chat stream to ask on → fail closed
  const approved = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      decisions.delete(renderId)
      resolve(false)
    }, timeoutMs)
    decisions.set(renderId, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
  })
  return approved ? 'allow' : 'deny'
}

// Release the lock when the turn's merged stream finishes OR the client disconnects.
async function* withLockRelease(src: AsyncIterable<StreamChunk>, lockDir: string): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) yield c
  } finally {
    releaseLock(lockDir)
  }
}

// Attach the chat routes onto an h3 app. The route is harness-agnostic: it resolves the turn's
// behaviour from the injected HarnessAdapter's capabilities, wiring the permission gate only
// for hook-capable harnesses and history only for transcript-capable ones.
//   POST /__pw/chat/permission          → PreToolUse hook decision (hook harnesses)
//   POST /__pw/chat/permission-decision → the widget's allow/deny, unblocking the gate
//   POST /__pw/chat/ui                  → inject agent generative UI onto the live turn
//   GET  /__pw/chat/session             → which session + lock state
//   GET  /__pw/chat/history?sessionId   → filtered prior turns (transcript harnesses)
//   POST /__pw/chat/stop                → SIGTERM the current lock holder
//   POST /__pw/chat                     → stream a turn (409 if the lock is held)
export function registerChatRoutes(app: H3, opts: ChatRouteOpts): void {
  const {harness} = opts
  // Resolve which session this preview continues: the agent's session wins (a hand-off from
  // `iterate`); otherwise resume the preview's own persisted chat session so the SAME thread
  // reopens across dev-server restarts, not just page reloads.
  const state = {sessionId: opts.initialSessionId || readSession(opts.lockDir, opts.previewId) || ''}
  const uiBus = opts.uiBus ?? makeUiBus()
  const decisions = new Map<string, (approved: boolean) => void>()

  // The PreToolUse hook POSTs each Bash tool here for a decision — only meaningful for
  // hook-capable harnesses, but always mounted so a stray hook call fails safe (allow).
  app.post('/__pw/chat/permission', async (event) => {
    const body = await readJsonBody(event)
    const toolName = isRecord(body) && typeof body.tool_name === 'string' ? body.tool_name : ''
    const toolInput = isRecord(body) ? body.tool_input : undefined
    const decision =
      harness.capabilities.permissionGate === 'hook'
        ? await decidePermission(toolName, toolInput, uiBus, decisions)
        : 'allow'
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: decision === 'allow' ? 'approved' : 'denied by the user (devgent chat gate)',
      },
    }
  })

  // The widget posts the user's allow/deny here, unblocking the gate above.
  app.post('/__pw/chat/permission-decision', async (event) => {
    const body = await readJsonBody(event)
    const renderId = isRecord(body) && typeof body.renderId === 'string' ? body.renderId : undefined
    const approved = isRecord(body) && body.approved === true
    const resolve = renderId ? decisions.get(renderId) : undefined
    if (resolve && renderId) {
      decisions.delete(renderId)
      resolve(approved)
    }
    return {ok: true}
  })

  // `devgent ui` posts a UI spec here; we inject it onto the live chat stream. Non-blocking.
  app.post('/__pw/chat/ui', async (event) => {
    const body = await readJsonBody(event)
    const spec = parseUiSpec(isRecord(body) ? body.spec : undefined)
    if (!spec) {
      event.res.status = 400
      return {error: 'invalid ui spec'}
    }
    const injected = uiBus.inject(spec)
    return {renderId: spec.renderId, injected}
  })

  app.get('/__pw/chat/session', () => {
    const lock = readLock(opts.lockDir)
    const sessionId = state.sessionId || null
    const source: ChatSession['source'] = state.sessionId ? (opts.initialSessionId ? 'agent' : 'chat') : 'new'
    const body: ChatSession = {sessionId, source, cwd: opts.cwd, lock: {held: lock.held, role: lock.role}}
    return body
  })

  app.get('/__pw/chat/history', (event) => {
    // History only exists for transcript-capable harnesses; others hydrate from the live thread.
    if (!harness.capabilities.transcriptHistory || !harness.history) return []
    const query = getQuery(event)
    const sessionId = typeof query.sessionId === 'string' ? query.sessionId : ''
    if (!sessionId) return []
    const jsonl = readFileOrEmpty(harness.history.transcriptPath(opts.cwd, sessionId))
    return jsonl ? harness.history.parse(jsonl) : []
  })

  app.post('/__pw/chat/stop', () => {
    const lock = readLock(opts.lockDir)
    if (lock.pid) {
      try {
        process.kill(lock.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    return {}
  })

  app.post('/__pw/chat', async (event) => {
    if (readLock(opts.lockDir).held) {
      event.res.status = 409
      return {error: 'agent busy'}
    }
    const body = await readJsonBody(event)
    const chat: ChatRequest = isChatRequest(body) ? body : {messages: []}
    const bodySessionId = isRecord(body) && typeof body.sessionId === 'string' ? body.sessionId : ''
    const resumeSessionId = harness.capabilities.resume ? bodySessionId || state.sessionId || null : null
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    const systemPrompt =
      harness.capabilities.systemPrompt === 'file' ? (opts.systemPromptFile ?? '') : (opts.systemPromptText ?? '')
    const args = harness.buildArgs({
      prompt: lastUserText(chat),
      cwd: opts.cwd,
      resumeSessionId,
      systemPrompt,
      permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/__pw/chat/permission` : undefined,
    })
    const child = opts.spawnHarness(args, opts.cwd)
    acquireLock(opts.lockDir, 'chat', child.pid)
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
        writeSession(opts.lockDir, opts.previewId, id)
      },
    })
    const merged = uiBus.run(events)
    const sse = toServerSentEventsStream(withLockRelease(merged, opts.lockDir), abort)
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
