import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import type {StreamChunk} from '@tanstack/ai'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {approvalIds} from './run-events.js'
import {makeRpcClient} from './session.js'

export type CallTool = (name: string, input: unknown) => Promise<unknown>

export type RunTypescript = (typescriptCode: string) => Promise<unknown>

const ExecuteReplySchema = z.object({result: z.unknown()}).loose()

const TruncatedReplySchema = z
  .object({'conciv:truncated': z.literal(true), reason: z.string(), head: z.string()})
  .loose()

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input ?? {})})
  `
}

function decodeReply(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw)
    const reply = ExecuteReplySchema.safeParse(parsed)
    if (reply.success && 'result' in reply.data) return reply.data.result
    return parsed
  } catch {
    return raw
  }
}

export type McpCallOptions = {deadlineMs?: number; label?: string}

const DEFAULT_DEADLINE_MS = 60_000

const DEFAULT_LABEL = 'execute_typescript'

function deadlineMessage(label: string, deadlineMs: number): string {
  return `runTypescript(${label}) exceeded ${deadlineMs}ms waiting on the MCP execute; the server-side run continues until its own timeout`
}

function toolsDeadlineMessage(label: string, deadlineMs: number): string {
  return `runTypescript(${label}) exceeded ${deadlineMs}ms waiting on the MCP tools/list; the execute never started`
}

export function makeRunTypescript(apiBase: string, session: string, options: McpCallOptions = {}): RunTypescript {
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS
  const label = options.label ?? DEFAULT_LABEL
  return async (typescriptCode) => {
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${apiBase}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: session}},
    })
    const deadline = AbortSignal.timeout(deadlineMs)
    try {
      const execute = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      if (!execute?.execute) throw new Error('execute_typescript not on /api/mcp')
      if (deadline.aborted) throw new Error(toolsDeadlineMessage(label, deadlineMs))
      const raw = await Promise.resolve(
        execute.execute({typescriptCode}, {abortSignal: deadline, emitCustomEvent: () => {}}),
      ).catch((error: unknown) => {
        if (!deadline.aborted) throw error
        throw new Error(deadlineMessage(label, deadlineMs), {cause: error})
      })
      if (typeof raw !== 'string') return raw
      return decodeReply(raw)
    } finally {
      await mcp.close().catch(() => {})
    }
  }
}

export function makeCallTool(apiBase: string, session: string, options: McpCallOptions = {}): CallTool {
  return async (name, input) => {
    const runTypescript = makeRunTypescript(apiBase, session, {...options, label: options.label ?? name})
    const reply = await runTypescript(callThroughCatalog(name, input))
    const truncated = TruncatedReplySchema.safeParse(reply)
    if (!truncated.success) return reply
    throw new Error(
      `the reply for tool "${name}" was truncated (${truncated.data.reason}); aggregate inside the sandbox with makeRunTypescript instead of pulling the full result`,
    )
  }
}

function abortSignalPromise(signal: AbortSignal): Promise<'aborted'> {
  if (signal.aborted) return Promise.resolve('aborted')
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve('aborted'), {once: true}))
}

async function pumpApprovals(
  stream: AsyncIterable<StreamChunk>,
  signal: AbortSignal,
  decide: (approvalId: string) => Promise<void>,
): Promise<void> {
  const iterator = stream[Symbol.asyncIterator]()
  const aborted = abortSignalPromise(signal)
  for (;;) {
    const next = await Promise.race([iterator.next(), aborted])
    if (next === 'aborted') {
      await iterator.return?.(undefined)?.catch(() => undefined)
      return
    }
    if (next.done) return
    for (const approvalId of approvalIds(next.value)) await decide(approvalId)
  }
}

export async function withAutoApproval<Result>(
  apiBase: string,
  session: string,
  run: () => Promise<Result>,
  onApproved?: (approvalId: string) => void,
): Promise<Result> {
  const rpc = makeRpcClient(apiBase)
  const sessionRpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
  const abort = new AbortController()
  const stream = await rpc.chat.events({sessionId: session}, {signal: abort.signal})
  const decided = new Set<string>()
  const decide = async (approvalId: string): Promise<void> => {
    if (decided.has(approvalId)) return
    decided.add(approvalId)
    await sessionRpc.chat.permissionDecision({approvalId, approved: true}, {signal: abort.signal})
    onApproved?.(approvalId)
  }
  const pump = pumpApprovals(stream, abort.signal, decide)
  pump.catch(() => {})
  try {
    return await run()
  } finally {
    abort.abort()
    await pump
  }
}

export function makeApprovingCallTool(apiBase: string, session: string, options: McpCallOptions = {}): CallTool {
  const call = makeCallTool(apiBase, session, options)
  return (name, input) => withAutoApproval(apiBase, session, () => call(name, input))
}

const RegistryInputSchema = z.record(z.string(), z.unknown())

export function makeApprovingRegistryCall(apiBase: string, session: string): CallTool {
  const sessionRpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
  return (name, input) =>
    withAutoApproval(apiBase, session, () =>
      sessionRpc.registry.call({name, input: RegistryInputSchema.parse(input ?? {})}),
    )
}
