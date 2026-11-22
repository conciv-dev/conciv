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

type Reply = z.infer<typeof CallResultSchema>['content']

type Decode = {value: (raw: string) => unknown; holdsValue: (raw: string) => boolean}

function parseReply(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function isExecuteReply(raw: string): boolean {
  const reply = ExecuteReplySchema.safeParse(parseReply(raw))
  return reply.success && 'result' in reply.data
}

function decodeExecuteReply(raw: string): unknown {
  const parsed = parseReply(raw)
  const reply = ExecuteReplySchema.safeParse(parsed)
  return reply.success && 'result' in reply.data ? reply.data.result : parsed
}

const directReply: Decode = {value: parseReply, holdsValue: () => true}

const executeReply: Decode = {value: decodeExecuteReply, holdsValue: isExecuteReply}

function withoutNotes(content: Reply, decode: Decode): Reply {
  const [first, ...rest] = content
  if (first?.text === undefined || !decode.holdsValue(first.text)) return content
  return [first, ...rest.filter((part) => part.type !== 'text')]
}

function readText(content: Reply): string {
  return content.flatMap((part) => (part.type === 'text' && part.text !== undefined ? [part.text] : [])).join('\n')
}

function readReply(name: string, raw: unknown, decode: Decode): unknown {
  const result = CallResultSchema.parse(raw)
  if (result.isError === true) throw new Error(readText(result.content))
  const content = withoutNotes(result.content, decode)
  const only = content[0]
  const reply = content.length === 1 && only?.text !== undefined ? decode.value(only.text) : content
  const truncated = TruncatedReplySchema.safeParse(reply)
  if (truncated.success) throw new Error(`the reply for tool "${name}" was truncated (${truncated.data.reason})`)
  return reply
}

const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

export function externalCallProgram(name: string, input: unknown): string {
  if (!PLAIN_IDENTIFIER.test(name)) {
    throw new Error(
      `the tool name "${name}" is not a plain identifier (letters, digits and _, not starting with a digit), so code mode cannot call it as external_${name}`,
    )
  }
  return `return await external_${name}(${JSON.stringify(input ?? {})})`
}

type SessionClient = {client: Client; names: Promise<ReadonlySet<string>>}

export type ToolClients = {
  call: (session: string, name: string, input: unknown) => Promise<unknown>
  close: () => Promise<void>
}

async function listNames(client: Client): Promise<ReadonlySet<string>> {
  const {tools} = await client.listTools(undefined, {signal: AbortSignal.timeout(DEADLINE_MS)})
  return new Set(tools.map((tool) => tool.name))
}

async function connectSession(apiBase: string, session: string): Promise<SessionClient> {
  const client = new Client({name: 'conciv-test', version: '0.0.0'})
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${apiBase}/api/mcp`), {
      requestInit: {headers: {[CONCIV_SESSION_HEADER]: session}},
    }),
  )
  return {client, names: listNames(client)}
}

async function isDirect(open: SessionClient, name: string): Promise<boolean> {
  const known = await open.names.catch(() => new Set<string>())
  if (known.has(name)) return true
  open.names = listNames(open.client)
  return (await open.names).has(name)
}

export function toolClients(apiBase: string): ToolClients {
  const sessions = new Map<string, Promise<SessionClient>>()
  const opened = (session: string): Promise<SessionClient> => {
    const known = sessions.get(session)
    if (known !== undefined) return known
    const connecting = connectSession(apiBase, session)
    sessions.set(session, connecting)
    connecting.catch(() => sessions.delete(session))
    return connecting
  }
  return {
    call: async (session, name, input) => {
      const open = await opened(session)
      const direct = await isDirect(open, name)
      const deadline = AbortSignal.timeout(DEADLINE_MS)
      const call = direct
        ? {name, arguments: z.record(z.string(), z.unknown()).parse(input ?? {})}
        : {name: 'execute_typescript', arguments: {typescriptCode: externalCallProgram(name, input)}}
      const raw = await open.client.callTool(call, undefined, {signal: deadline}).catch((error: unknown) => {
        if (!deadline.aborted) throw error
        throw new Error(`the tool ${name} gave no reply within ${DEADLINE_MS}ms`, {cause: error})
      })
      return readReply(name, raw, direct ? directReply : executeReply)
    },
    close: async () => {
      const open = [...sessions.values()]
      sessions.clear()
      await Promise.allSettled(open.map(async (connecting) => (await connecting).client.close()))
    },
  }
}
