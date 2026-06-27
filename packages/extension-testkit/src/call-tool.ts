import {createMCPClient} from '@tanstack/ai-mcp'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'

export type CallTool = (name: string, input: unknown) => Promise<unknown>

export function makeCallTool(apiBase: string, session: string): CallTool {
  return async (name, input) => {
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${apiBase}/api/mcp`, headers: {[MANDARAX_SESSION_HEADER]: session}},
    })
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === name)
      if (!tool?.execute) throw new Error(`tool ${name} not on /api/mcp`)
      return await tool.execute(input)
    } finally {
      await mcp.close()
    }
  }
}
