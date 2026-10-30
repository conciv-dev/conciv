import {z} from 'zod'

const ReplySchema = z.object({
  content: z.array(z.object({text: z.string()}).loose()),
  isError: z.boolean().optional(),
})

export type CallTool = (name: string, input: unknown) => Promise<unknown>

export async function resolveSession(apiBase: string): Promise<string> {
  const {makeRpcClient} = await import('@conciv/contract')
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve({})
  return sessionId
}

export function makeCallTool(apiBase: string, session: string): CallTool {
  return async (name, input) => {
    const [{Client}, {StreamableHTTPClientTransport}, {CONCIV_SESSION_HEADER}] = await Promise.all([
      import('@modelcontextprotocol/sdk/client/index.js'),
      import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
      import('@conciv/protocol/chat-types'),
    ])
    const mcp = new Client({name: 'conciv-e2e', version: '0.0.0'})
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${apiBase}/api/mcp`), {
        requestInit: {headers: {[CONCIV_SESSION_HEADER]: session}},
      }),
    )
    try {
      const typescriptCode = `return await external_${name}(${JSON.stringify(input ?? {})})`
      const reply = ReplySchema.parse(await mcp.callTool({name: 'execute_typescript', arguments: {typescriptCode}}))
      const raw = reply.content.map((part) => part.text).join('\n')
      if (reply.isError === true) throw new Error(raw)
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && 'result' in parsed) return parsed.result
      return parsed
    } finally {
      await mcp.close()
    }
  }
}
