import {query, type Query, type SDKMessage, type SDKUserMessage, type Options} from '@anthropic-ai/claude-agent-sdk'
import type {StreamChunk} from '@tanstack/ai'
import type {HarnessRun, HarnessRunContext, HarnessTurn} from '@conciv/protocol/harness-types'
import {imageRefs, mcpServerConfig} from './args.js'
import {claudeMessagesToAgui} from './decode.js'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'

const IDLE_EVICT_MS = 5 * 60 * 1000

type InputQueue = {push: (m: SDKUserMessage) => void; end: () => void; stream: AsyncGenerator<SDKUserMessage>}

function makeInputQueue(): InputQueue {
  const items: SDKUserMessage[] = []
  const waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  const state = {done: false}
  function push(m: SDKUserMessage): void {
    const w = waiters.shift()
    if (w) w({value: m, done: false})
    else items.push(m)
  }
  function end(): void {
    state.done = true
    const w = waiters.shift()
    if (w) w({value: undefined, done: true})
  }
  async function* stream(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const buffered = items.shift()
      if (buffered !== undefined) {
        yield buffered
        continue
      }
      if (state.done) return
      const next = await new Promise<IteratorResult<SDKUserMessage>>((resolve) => waiters.push(resolve))
      if (next.done) return
      yield next.value
    }
  }
  return {push, end, stream: stream()}
}

type CtxRef = {ctx: HarnessRunContext}

type WarmSession = {
  id: string
  query: Query
  output: AsyncIterator<SDKMessage>
  input: InputQueue
  cwd: string
  model?: string
  ctxRef: CtxRef
  idle: ReturnType<typeof setTimeout> | null
}

const sessions = new Map<string, WarmSession>()

const stats = {spawned: 0}
export function __sdkStats(): {spawned: number; live: number} {
  return {spawned: stats.spawned, live: sessions.size}
}
export function __sdkReset(): void {
  claudeSdkShutdown()
  stats.spawned = 0
}

function userMessage(turn: HarnessTurn): SDKUserMessage {
  const content = turn.images?.length ? `${turn.prompt}\n\n${imageRefs(turn.images, turn.cwd)}` : turn.prompt
  return {type: 'user', message: {role: 'user', content}, parent_tool_use_id: null}
}

function buildOptions(turn: HarnessTurn, ctxRef: CtxRef): Options {
  const options: Options = {
    cwd: turn.cwd,
    permissionMode: 'acceptEdits',
    includePartialMessages: true,
    env: ctxRef.ctx.env,
    canUseTool: async (toolName, input, {toolUseID}) => {
      const decision = await ctxRef.ctx.decide(toolName, input, toolUseID)
      return decision === 'allow'
        ? {behavior: 'allow', updatedInput: input}
        : {behavior: 'deny', message: 'Denied by the user (conciv chat gate)'}
    },
  }
  if (turn.systemPrompt) options.systemPrompt = {type: 'preset', preset: 'claude_code', append: turn.systemPrompt}
  if (turn.model) options.model = turn.model
  if (turn.mcpUrl) options.mcpServers = mcpServerConfig(turn.mcpUrl, turn.sessionId)
  if (CONCIV_PLUGIN_DIR) options.plugins = [{type: 'local', path: CONCIV_PLUGIN_DIR}]
  if (turn.resumeSessionId) options.resume = turn.resumeSessionId
  return options
}

function createSession(turn: HarnessTurn, ctx: HarnessRunContext): WarmSession {
  stats.spawned += 1
  const input = makeInputQueue()
  const ctxRef: CtxRef = {ctx}
  const q = query({prompt: input.stream, options: buildOptions(turn, ctxRef)})
  const ws: WarmSession = {
    id: ctx.sessionId,
    query: q,
    output: q[Symbol.asyncIterator](),
    input,
    cwd: turn.cwd,
    model: turn.model,
    ctxRef,
    idle: null,
  }
  sessions.set(ws.id, ws)
  return ws
}

function getOrCreate(turn: HarnessTurn, ctx: HarnessRunContext): WarmSession {
  const existing = sessions.get(ctx.sessionId)
  if (existing && existing.cwd === turn.cwd) {
    if (existing.idle) clearTimeout(existing.idle)
    existing.idle = null
    existing.ctxRef.ctx = ctx
    return existing
  }
  if (existing) evict(ctx.sessionId)
  return createSession(turn, ctx)
}

function armIdle(ws: WarmSession): void {
  if (ws.idle) clearTimeout(ws.idle)
  ws.idle = setTimeout(() => evict(ws.id), IDLE_EVICT_MS)
  ws.idle.unref?.()
}

function evict(sessionId: string): void {
  const ws = sessions.get(sessionId)
  if (!ws) return
  sessions.delete(sessionId)
  if (ws.idle) clearTimeout(ws.idle)
  ws.input.end()
  void ws.query.interrupt().catch(() => {})
}

async function* turnMessages(ws: WarmSession): AsyncGenerator<SDKMessage> {
  while (true) {
    let res: IteratorResult<SDKMessage>
    try {
      res = await ws.output.next()
    } catch (error) {
      evict(ws.id)
      throw error
    }
    if (res.done) {
      evict(ws.id)
      return
    }
    yield res.value
    if (res.value.type === 'result') return
  }
}

export const claudeSdkRun: HarnessRun = async function* (turn, ctx): AsyncGenerator<StreamChunk> {
  const ws = getOrCreate(turn, ctx)
  if (turn.model && turn.model !== ws.model) {
    ws.model = turn.model
    await ws.query.setModel(turn.model).catch(() => {})
  }
  const onAbort = (): void => void ws.query.interrupt().catch(() => {})
  ctx.signal.addEventListener('abort', onAbort)
  ws.input.push(userMessage(turn))
  try {
    yield* claudeMessagesToAgui(turnMessages(ws), {
      onSessionId: ctx.onSessionId,
      onUsage: ctx.onUsage,
      runId: ctx.runId,
      threadId: ctx.threadId,
      logger: ctx.logger,
    })
  } finally {
    ctx.signal.removeEventListener('abort', onAbort)
    if (sessions.has(ws.id)) armIdle(ws)
  }
}

export function claudeSdkShutdown(): void {
  const ids = [...sessions.keys()]
  for (const id of ids) evict(id)
}
