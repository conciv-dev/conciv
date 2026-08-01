export type CallTool = (name: string, input: unknown) => Promise<unknown>

type AiMcp = typeof import('@tanstack/ai-mcp')
type McpClient = Awaited<ReturnType<AiMcp['createMCPClient']>>

export async function resolveSession(apiBase: string): Promise<string> {
  const {makeRpcClient} = await import('@conciv/contract')
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve({})
  return sessionId
}

async function resolveTool(mcp: McpClient, name: string) {
  const listed = (await mcp.tools()).find((entry) => entry.name === name)
  if (listed) return listed
  await mcp.callTool('conciv_discover_tools', {names: [name]})
  return (await mcp.tools()).find((entry) => entry.name === name)
}

export function makeCallTool(apiBase: string, session: string): CallTool {
  return async (name, input) => {
    const [{createMCPClient}, {CONCIV_SESSION_HEADER}] = await Promise.all([
      import('@tanstack/ai-mcp'),
      import('@conciv/protocol/chat-types'),
    ])
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
