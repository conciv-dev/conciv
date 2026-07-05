import {createMCPClient} from '@tanstack/ai-mcp'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

export type CallTool = (name: string, input: unknown) => Promise<unknown>

export function makeCallTool(apiBase: string, session: string): CallTool {
  return async (name, input) => {
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${apiBase}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: session}},
    })
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === name)
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
