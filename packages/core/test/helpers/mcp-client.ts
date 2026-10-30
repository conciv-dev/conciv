import {z} from 'zod'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type McpContentPart =
  | {type: 'text'; content: string}
  | {type: 'image'; source: {type: 'data'; value: string; mimeType: string}}

export type McpTool = {
  name: string
  description: string
  execute: (input: Record<string, unknown>) => Promise<string | McpContentPart[]>
}

export type McpClient = {tools: () => Promise<McpTool[]>; close: () => Promise<void>}

const ContentSchema = z.array(
  z.discriminatedUnion('type', [
    z.object({type: z.literal('text'), text: z.string()}),
    z.object({type: z.literal('image'), data: z.string(), mimeType: z.string()}),
  ]),
)

const CallResultSchema = z.object({content: ContentSchema, isError: z.boolean().optional()})

function contentOf(content: z.infer<typeof ContentSchema>): string | McpContentPart[] {
  const only = content[0]
  if (content.length === 1 && only?.type === 'text') return only.text
  return content.map((part) =>
    part.type === 'text'
      ? {type: 'text', content: part.text}
      : {type: 'image', source: {type: 'data', value: part.data, mimeType: part.mimeType}},
  )
}

function textOf(content: z.infer<typeof ContentSchema>): string {
  return content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
}

export async function connectMcpClient(url: string, headers?: Record<string, string>): Promise<McpClient> {
  const client = new Client({name: 'conciv-test', version: '0.0.0'})
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {requestInit: {headers}}))
  return {
    tools: async () =>
      (await client.listTools()).tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        execute: async (input) => {
          const result = CallResultSchema.parse(await client.callTool({name: tool.name, arguments: input}))
          if (result.isError === true) throw new Error(textOf(result.content))
          return contentOf(result.content)
        },
      })),
    close: () => client.close(),
  }
}
