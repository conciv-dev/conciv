import {createMCPClient} from '@tanstack/ai-mcp'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {approvalIds} from './run-events.js'
import {makeRpcClient} from './session.js'

export type CallTool = (name: string, input: unknown) => Promise<unknown>

type McpClient = Awaited<ReturnType<typeof createMCPClient>>

async function resolveTool(mcp: McpClient, name: string) {
  const listed = (await mcp.tools()).find((entry) => entry.name === name)
  if (listed) return listed
  await mcp.callTool('conciv_discover_tools', {names: [name]})
  return (await mcp.tools()).find((entry) => entry.name === name)
}

export function makeCallTool(apiBase: string, session: string): CallTool {
  return async (name, input) => {
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${apiBase}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: session}},
    })
    try {
      const tool = await resolveTool(mcp, name)
      if (!tool?.execute) throw new Error(`tool ${name} not on /api/mcp`)
      const result = await tool.execute(input)
      if (typeof result !== 'string') return result
      try {
        return JSON.parse(result)
      } catch {
        return result
      }
    } finally {
      await mcp.close()
    }
  }
}

export function makeApprovingCallTool(apiBase: string, session: string): CallTool {
  const rpc = makeRpcClient(apiBase)
  const call = makeCallTool(apiBase, session)
  return async (name, input) => {
    const abort = new AbortController()
    const decided = new Set<string>()
    const pump = (async () => {
      const stream = await rpc.chat.attach({sessionId: session}, {signal: abort.signal})
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
