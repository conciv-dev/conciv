export type CallTool = (name: string, input: unknown) => Promise<unknown>

export async function resolveSession(apiBase: string): Promise<string> {
  const {makeRpcClient} = await import('@conciv/contract')
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve({})
  return sessionId
}

function callThroughCatalog(name: string, input: unknown): string {
  return [
    `const found = await external_catalog({name: ${JSON.stringify(name)}})`,
    `return await globalThis[found.call](${JSON.stringify(input ?? {})})`,
  ].join('\n')
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
      const execute = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      if (!execute?.execute) throw new Error('execute_typescript not on /api/mcp')
      const raw = await execute.execute({typescriptCode: callThroughCatalog(name, input)})
      if (typeof raw !== 'string') return raw
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && 'result' in parsed) return parsed.result
      return parsed
    } finally {
      await mcp.close()
    }
  }
}
