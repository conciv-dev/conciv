import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {z} from 'zod'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

const DEADLINE_MS = 60_000

const CallResultSchema = z.object({
  content: z.array(z.object({type: z.string(), text: z.string().optional()}).loose()),
  isError: z.boolean().optional(),
})

const ExecuteReplySchema = z.object({result: z.unknown()}).loose()

const TruncatedReplySchema = z.object({'conciv:truncated': z.literal(true), reason: z.string()}).loose()

type Decode = (raw: string) => unknown

function parseReply(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function decodeExecuteReply(raw: string): unknown {
  const parsed = parseReply(raw)
  const reply = ExecuteReplySchema.safeParse(parsed)
  return reply.success && 'result' in reply.data ? reply.data.result : parsed
}

function readText(content: z.infer<typeof CallResultSchema>['content']): string {
  return content.flatMap((part) => (part.type === 'text' && part.text !== undefined ? [part.text] : [])).join('\n')
}

function readReply(name: string, raw: unknown, decode: Decode): unknown {
  const result = CallResultSchema.parse(raw)
  if (result.isError === true) throw new Error(readText(result.content))
  const only = result.content[0]
  const reply = result.content.length === 1 && only?.text !== undefined ? decode(only.text) : result.content
  const truncated = TruncatedReplySchema.safeParse(reply)
  if (truncated.success) throw new Error(`the reply for tool "${name}" was truncated (${truncated.data.reason})`)
  return reply
}

export async function callTool(apiBase: string, session: string, name: string, input: unknown): Promise<unknown> {
  const client = new Client({name: 'conciv-test', version: '0.0.0'})
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${apiBase}/api/mcp`), {
      requestInit: {headers: {[CONCIV_SESSION_HEADER]: session}},
    }),
  )
  try {
    const deadline = AbortSignal.timeout(DEADLINE_MS)
    const {tools} = await client.listTools(undefined, {signal: deadline})
    const direct = tools.some((tool) => tool.name === name)
    const typescriptCode = `return await external_${name}(${JSON.stringify(input ?? {})})`
    const call = direct
      ? {name, arguments: z.record(z.string(), z.unknown()).parse(input ?? {})}
      : {name: 'execute_typescript', arguments: {typescriptCode}}
    const raw = await client.callTool(call, undefined, {signal: deadline}).catch((error: unknown) => {
      if (!deadline.aborted) throw error
      throw new Error(`the tool ${name} gave no reply within ${DEADLINE_MS}ms`, {cause: error})
    })
    return readReply(name, raw, direct ? parseReply : decodeExecuteReply)
  } finally {
    await client.close().catch(() => {})
  }
}
