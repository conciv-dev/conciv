import {readFileSync} from 'node:fs'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {createInterface} from 'node:readline'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {toServerSentEventsStream} from '@tanstack/ai'
import {buildChatClaudeArgs} from './claude-args.js'
import {claudeToAguiEvents} from './claude-agui-stream.js'
import {acquireLock, readLock, releaseLock} from './claude-lock.js'
import {parseHistory} from './history-parser.js'
import {transcriptPath} from './transcript-path.js'
import {readSession, writeSession} from './chat-session-store.js'
import {randomUUID} from 'node:crypto'
import {makeUiBus} from './ui-bus.js'
import {parseUiSpec} from '@devgent/protocol/ui-types'
import {bashDecision} from './risk.js'
import type {ChatRequest, ChatSession} from '@devgent/protocol/chat-types'

export type ClaudeChild = {pid: number; stdout: Readable; stderr: Readable; kill: () => void}
export type SpawnClaude = (args: string[], cwd: string) => ClaudeChild

export type ChatRouteOpts = {
  cwd: string
  lockDir: string
  previewId: string // ties the persisted chat session to this preview (same preview → same chat)
  initialSessionId: string // the agent's session id, '' if none
  spawnClaude: SpawnClaude
  appendSystemPromptFile?: string
  uiBus?: ReturnType<typeof makeUiBus> // shared so other routes can inject onto the live turn
}

type NextFn = (err?: unknown) => void

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// Turn a child's stdout into an async iterable of lines.
async function* linesOf(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of rl) yield line
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

// Pull the latest user-turn text from the posted messages. Tolerant of both the
// parts-based UIMessage shape ({role, parts:[{type:'text', content}]}) and a plain
// {role, content: string} model message, since the transport may send either.
function lastUserText(req: ChatRequest): string {
  const users = req.messages.filter((m): m is Record<string, unknown> => isRecord(m) && m.role === 'user')
  const last = users.at(-1)
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  if (!Array.isArray(last.parts)) return ''
  return last.parts
    .filter((p): p is Record<string, unknown> => isRecord(p) && p.type === 'text' && typeof p.content === 'string')
    .map((p) => p.content as string)
    .join('\n')
}

const APPROVAL_TIMEOUT_MS = 120_000

// Decide a PreToolUse Bash permission. Safe commands run; risky ones surface a confirm card
// in the chat (injected onto the live stream) and block until the user answers or we time
// out — fail closed. Non-Bash tools are allowed (edits are handled by acceptEdits).
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

// The /__pw/chat* connect middleware. Resolves which claude session to continue, spawns a
// headless `claude -p`, transcodes its stream-json to SSE StreamChunks, and serializes
// against the agent via the shared lock. Routes:
//   GET  /__pw/chat/session            → which session + lock state
//   GET  /__pw/chat/history?sessionId  → filtered prior turns for hydration
//   POST /__pw/chat/stop               → SIGTERM the current lock holder
//   POST /__pw/chat                    → stream a turn (409 if the lock is held)
export function makeChatRoute(
  opts: ChatRouteOpts,
): (req: IncomingMessage, res: ServerResponse, next: NextFn) => Promise<void> {
  // Resolve which session this preview continues: the agent's session wins (the chat is a
  // hand-off from `iterate`); otherwise resume the preview's own persisted chat session so the
  // SAME thread reopens across dev-server restarts, not just page reloads.
  const state = {sessionId: opts.initialSessionId || readSession(opts.lockDir, opts.previewId) || ''}
  // Injects agent-emitted generative UI (`devgent ui …` → POST /__pw/chat/ui) onto the active
  // turn's stream as AG-UI CUSTOM events. Shared between the stream handler and the ui route.
  // Honour a caller-supplied bus so sibling routes (e.g. vitest) inject onto the same turn.
  const uiBus = opts.uiBus ?? makeUiBus()
  // Pending risky-Bash approvals, keyed by the confirm card's renderId.
  const decisions = new Map<string, (approved: boolean) => void>()
  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/__pw/chat')) return next()

    // The PreToolUse hook (wired via --settings) POSTs each Bash tool here for a decision.
    if (url === '/__pw/chat/permission' && req.method === 'POST') {
      const hook = JSON.parse(await readBody(req)) as {tool_name?: string; tool_input?: unknown}
      const decision = await decidePermission(hook.tool_name ?? '', hook.tool_input, uiBus, decisions)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: decision,
            permissionDecisionReason: decision === 'allow' ? 'approved' : 'denied by the user (devgent chat gate)',
          },
        }),
      )
      return
    }

    // The widget posts the user's allow/deny here, unblocking the gate above.
    if (url === '/__pw/chat/permission-decision' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as {renderId?: string; approved?: boolean}
      const resolve = body.renderId ? decisions.get(body.renderId) : undefined
      if (resolve && body.renderId) {
        decisions.delete(body.renderId)
        resolve(Boolean(body.approved))
      }
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ok: true}))
      return
    }

    // `devgent ui` posts a UI spec here; we inject it onto the live chat stream. Non-blocking:
    // the agent does not wait — the user's answer arrives as their next chat message.
    if (url === '/__pw/chat/ui' && req.method === 'POST') {
      const uiBody = JSON.parse(await readBody(req)) as {spec?: unknown}
      const spec = parseUiSpec(uiBody.spec)
      if (!spec) {
        res.statusCode = 400
        res.end(JSON.stringify({error: 'invalid ui spec'}))
        return
      }
      const injected = uiBus.inject(spec)
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({renderId: spec.renderId, injected}))
      return
    }

    if (url === '/__pw/chat/session' && req.method === 'GET') {
      const lock = readLock(opts.lockDir)
      const sessionId = state.sessionId || null
      const source: ChatSession['source'] = state.sessionId ? (opts.initialSessionId ? 'agent' : 'chat') : 'new'
      const body: ChatSession = {sessionId, source, cwd: opts.cwd, lock: {held: lock.held, role: lock.role}}
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
      return
    }

    if (url.startsWith('/__pw/chat/history') && req.method === 'GET') {
      const sessionId = new URL(url, 'http://x').searchParams.get('sessionId') ?? ''
      res.setHeader('content-type', 'application/json; charset=utf-8')
      if (!sessionId) {
        res.end(JSON.stringify([]))
        return
      }
      const jsonl = ((): string => {
        try {
          return readFileSync(transcriptPath(opts.cwd, sessionId), 'utf8')
        } catch {
          return ''
        }
      })()
      res.end(JSON.stringify(jsonl ? parseHistory(jsonl) : []))
      return
    }

    if (url === '/__pw/chat/stop' && req.method === 'POST') {
      const lock = readLock(opts.lockDir)
      if (lock.pid) {
        try {
          process.kill(lock.pid, 'SIGTERM')
        } catch {
          // already gone
        }
      }
      res.statusCode = 200
      res.end('{}')
      return
    }

    if (url === '/__pw/chat' && req.method === 'POST') {
      if (readLock(opts.lockDir).held) {
        res.statusCode = 409
        res.end(JSON.stringify({error: 'agent busy'}))
        return
      }
      const body = JSON.parse(await readBody(req)) as ChatRequest
      const resumeSessionId = body.sessionId || state.sessionId || null
      const origin = `http://${req.headers?.host ?? '127.0.0.1:3000'}`
      const args = buildChatClaudeArgs({
        prompt: lastUserText(body),
        cwd: opts.cwd,
        resumeSessionId,
        appendSystemPromptFile: opts.appendSystemPromptFile,
        permissionUrl: `${origin}/__pw/chat/permission`,
      })
      const child = opts.spawnClaude(args, opts.cwd)
      acquireLock(opts.lockDir, 'chat', child.pid)
      const abort = new AbortController()
      res.statusCode = 200
      res.setHeader('content-type', 'text/event-stream')
      res.setHeader('cache-control', 'no-cache')
      res.setHeader('connection', 'keep-alive')
      res.setHeader('access-control-allow-origin', '*')
      req.on('close', () => {
        abort.abort()
        child.kill()
      })
      // Claude stream-json → TanStack AG-UI events → TanStack's own SSE encoder. The widget
      // consumes the result with fetchServerSentEvents natively — no custom wire format.
      const events = claudeToAguiEvents(linesOf(child.stdout), {
        onSessionId: (id) => {
          state.sessionId = id
          // Persist so the next dev-server start for this preview resumes this same thread.
          writeSession(opts.lockDir, opts.previewId, id)
        },
      })
      // Merge agent-emitted generative UI (CUSTOM events) into the turn's stream.
      const merged = uiBus.run(events)
      const sse = toServerSentEventsStream(merged, abort)
      const nodeStream = Readable.fromWeb(sse as Parameters<typeof Readable.fromWeb>[0])
      try {
        await pipeline(nodeStream, res)
      } catch {
        // client disconnect / abort — the lock still releases below
      } finally {
        releaseLock(opts.lockDir)
      }
      return
    }

    return next()
  }
}
