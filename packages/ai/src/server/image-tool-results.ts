import {randomBytes} from 'node:crypto'
import {once} from 'node:events'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {text} from 'node:stream/consumers'
import {
  createToolBridgeCore,
  handleBridgeJsonRpc,
  hostForSandbox,
  timingSafeBearerEqual,
  type ToolBridgeCore,
  type ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import {z} from 'zod'
import {imageBlocks, imagesIn, withoutImages} from '@conciv/protocol/chat-message-types'

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

export const imageToolProvisioner: ToolBridgeProvisioner = {
  provision: async (tools, {provider, ...options}) => {
    const token = randomBytes(24).toString('hex')
    const core = createToolBridgeCore(tools, options)
    const server = createServer((request, response) => {
      if (!timingSafeBearerEqual(request.headers.authorization, token)) {
        response.writeHead(401).end('unauthorized')
        return
      }
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
  },
}
