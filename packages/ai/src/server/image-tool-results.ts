import {randomBytes} from 'node:crypto'
import {once} from 'node:events'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {text} from 'node:stream/consumers'
import {
  createToolBridgeCore,
  handleBridgeJsonRpc,
  hostForSandbox,
  timingSafeBearerEqual,
  type BridgePermission,
  type PermissionToolResult,
  type ProvisionedBridge,
  type ToolBridgeCore,
  type ToolBridgeCoreOptions,
  type ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import type {AnyTool} from '@tanstack/ai'
import {z} from 'zod'
import {imageBlocks, imagesIn, withoutImages} from '@conciv/protocol/chat-message-types'
import type {HarnessPermissionAsk, HarnessPermissionVerdict} from '@conciv/protocol/harness-types'

export type AskPermission = (
  threadId: string,
  ask: HarnessPermissionAsk,
  signal: AbortSignal,
) => Promise<HarnessPermissionVerdict>

const PromptRequestSchema = z.object({
  tool_name: z.string().catch('tool'),
  input: z.record(z.string(), z.unknown()).catch({}),
})

const TARGET_FIELDS = ['command', 'file_path', 'notebook_path', 'path', 'url'] as const

function readPromptAsk(request: unknown): HarnessPermissionAsk {
  const {tool_name, input} = PromptRequestSchema.parse(request ?? {})
  const target = TARGET_FIELDS.map((field) => input[field]).find((value) => typeof value === 'string')
  return {action: tool_name.toLowerCase(), resources: [typeof target === 'string' ? target : '*'], metadata: input}
}

async function answerPrompt(
  ask: AskPermission,
  threadId: string,
  request: unknown,
  signal: AbortSignal,
): Promise<PermissionToolResult> {
  const asked = readPromptAsk(request)
  const verdict = await ask(threadId, asked, signal)
  if (verdict.allowed) return {behavior: 'allow', updatedInput: asked.metadata}
  return {behavior: 'deny', message: verdict.message}
}

const ToolReplySchema = z.looseObject({
  result: z.looseObject({content: z.tuple([z.object({type: z.literal('text'), text: z.string()})])}),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parsed(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function withImageBlocks(reply: unknown): unknown {
  const tool = ToolReplySchema.safeParse(reply)
  if (!tool.success) return reply
  const value = parsed(tool.data.result.content[0].text)
  const images = imagesIn(value)
  if (images.length === 0) return reply
  const content = [{type: 'text', text: JSON.stringify(withoutImages(value))}, ...imageBlocks(images)]
  return {...tool.data, result: {...tool.data.result, content}}
}

async function answer(core: ToolBridgeCore, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'POST') return void response.writeHead(405).end()
  const message = parsed(await text(request))
  if (message === undefined) return void response.writeHead(400).end('invalid JSON body')
  const reply = await handleBridgeJsonRpc(core, message)
  if (reply === null) return void response.writeHead(202).end()
  response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify(withImageBlocks(reply)))
}

function promptPermission(
  permission: BridgePermission | undefined,
  ask: AskPermission,
  threadId: string,
  signal: AbortSignal,
): BridgePermission | undefined {
  if (permission === undefined) return undefined
  return {toolName: permission.toolName, resolve: (request) => answerPrompt(ask, threadId, request, signal)}
}

function requestSignal(response: ServerResponse, run: AbortSignal | undefined): AbortSignal {
  const closed = new AbortController()
  response.once('close', () => closed.abort())
  return run === undefined ? closed.signal : AbortSignal.any([closed.signal, run])
}

export function askingToolProvisioner(ask: AskPermission): ToolBridgeProvisioner {
  return {provision: (tools, {provider, ...options}) => provisionToolServer(tools, provider, options, ask)}
}

async function provisionToolServer(
  tools: Array<AnyTool>,
  provider: string,
  options: ToolBridgeCoreOptions,
  ask: AskPermission,
): Promise<ProvisionedBridge> {
  const token = randomBytes(24).toString('hex')
  const server = createServer((request, response) => {
    if (!timingSafeBearerEqual(request.headers.authorization, token)) {
      response.writeHead(401).end('unauthorized')
      return
    }
    const signal = requestSignal(response, options.signal)
    const core = createToolBridgeCore(tools, {
      ...options,
      permission: promptPermission(options.permission, ask, options.threadId, signal),
    })
    answer(core, request, response).catch((error: unknown) => {
      console.error(`[ai] the tool bridge request failed: ${String(error)}`)
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })
  await once(server.listen(0, '127.0.0.1'), 'listening')
  const address = server.address()
  if (!isRecord(address) || typeof address.port !== 'number') throw new Error('the tool bridge has no port')
  return {
    name: 'tanstack',
    url: `http://${hostForSandbox(provider)}:${address.port}/mcp`,
    token,
    close: () => {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()))
      server.closeAllConnections()
      return closed
    },
  }
}
