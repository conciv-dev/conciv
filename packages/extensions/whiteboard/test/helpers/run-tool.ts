import {createMCPClient} from '@tanstack/ai-mcp'
import type {ToolRequest} from '@mandarax/extension'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'

export function sessionId(label: string): string {
  return `mandarax_${label}`
}

type ServerTool = {__execute?: (input: unknown, ctx?: unknown, request?: ToolRequest) => Promise<unknown>}

export async function runServer(
  tool: ServerTool,
  input: unknown,
  ctx: unknown,
  request: ToolRequest,
): Promise<unknown> {
  if (!tool.__execute) throw new Error('tool has no server implementation')
  return tool.__execute(input, ctx, request)
}

export async function callTool(core: string, session: string, name: string, input: unknown): Promise<unknown> {
  const mcp = await createMCPClient({
    transport: {type: 'http', url: `${core}/api/mcp`, headers: {[MANDARAX_SESSION_HEADER]: session}},
  })
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === name)
    if (!tool?.execute) throw new Error(`tool ${name} not registered on /api/mcp`)
    return await tool.execute(input)
  } finally {
    await mcp.close()
  }
}

export function postAction(extBase: string, path: string, body: unknown, session?: string): Promise<Response> {
  return fetch(`${extBase}${path}`, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...(session ? {[MANDARAX_SESSION_HEADER]: session} : {})},
    body: JSON.stringify(body),
  })
}
