import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {approvalIds} from './run-events.js'
import {makeRpcClient} from './session.js'

export type CallTool = (name: string, input: unknown) => Promise<unknown>

export type RunTypescript = (typescriptCode: string) => Promise<unknown>

const ExecuteReplySchema = z.object({result: z.unknown()}).loose()

const TruncatedReplySchema = z.object({truncated: z.literal(true), reason: z.string(), head: z.string()}).loose()

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

export function makeRunTypescript(apiBase: string, session: string): RunTypescript {
  return async (typescriptCode) => {
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${apiBase}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: session}},
    })
    try {
      const execute = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      if (!execute?.execute) throw new Error('execute_typescript not on /api/mcp')
      const raw = await execute.execute({typescriptCode})
      if (typeof raw !== 'string') return raw
      return decodeReply(raw)
    } finally {
      await mcp.close()
    }
  }
}

export function makeCallTool(apiBase: string, session: string): CallTool {
  const runTypescript = makeRunTypescript(apiBase, session)
  return async (name, input) => {
    const reply = await runTypescript(callThroughCatalog(name, input))
    const truncated = TruncatedReplySchema.safeParse(reply)
    if (!truncated.success) return reply
    throw new Error(
      `the reply for tool "${name}" was truncated (${truncated.data.reason}); aggregate inside the sandbox with makeRunTypescript instead of pulling the full result`,
    )
  }
}

export function makeApprovingCallTool(apiBase: string, session: string): CallTool {
  const rpc = makeRpcClient(apiBase)
  const call = makeCallTool(apiBase, session)
  return async (name, input) => {
    const abort = new AbortController()
    const decided = new Set<string>()
    const pump = (async () => {
      const stream = await rpc.chat.subscribe({sessionId: session}, {signal: abort.signal})
      for await (const chunk of stream) {
        for (const approvalId of approvalIds(chunk)) {
          if (decided.has(approvalId)) continue
          decided.add(approvalId)
          await rpc.chat.permissionDecision({approvalId, approved: true})
        }
      }
    })()
    try {
      return await call(name, input)
    } finally {
      abort.abort()
      await pump.catch(() => {})
    }
  }
}
