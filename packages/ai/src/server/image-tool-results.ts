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

const ImagePartSchema = z.looseObject({
  type: z.literal('image'),
  source: z.looseObject({type: z.literal('data'), value: z.string(), mimeType: z.string()}),
})

type ImagePart = z.infer<typeof ImagePartSchema>

const ToolReplySchema = z.looseObject({
  result: z.looseObject({content: z.tuple([z.object({type: z.literal('text'), text: z.string()})])}),
})

const IMAGE_STUB = {type: 'image', sent: 'as an image block beside this text'}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function imagesIn(value: unknown): ImagePart[] {
  const image = ImagePartSchema.safeParse(value)
  if (image.success) return [image.data]
  if (Array.isArray(value)) return value.flatMap(imagesIn)
  return isRecord(value) ? Object.values(value).flatMap(imagesIn) : []
}

export function withoutImages(value: unknown): unknown {
  if (ImagePartSchema.safeParse(value).success) return IMAGE_STUB
  if (Array.isArray(value)) return value.map(withoutImages)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withoutImages(entry)]))
}

function parsed(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

export function imageBlocks(images: readonly ImagePart[]): {type: 'image'; data: string; mimeType: string}[] {
  return images.map(({source}) => ({type: 'image', data: source.value, mimeType: source.mimeType}))
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
