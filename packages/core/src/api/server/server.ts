import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'

const ResolveQuerySchema = z.object({spec: z.string(), importer: z.string().optional()})
const FileQuerySchema = z.object({file: z.string()})
const TransformQuerySchema = z.object({url: z.string()})
const ReloadBodySchema = z.object({file: z.string()})
const RestartBodySchema = z.object({force: z.boolean().default(false)})

export function makeServerRoutes(bridge: () => BundlerBridge | undefined) {
  const requireBridge = (): BundlerBridge => {
    const found = bridge()
    if (!found) throw new HTTPException(503, {message: 'no bundler bridge'})
    return found
  }
  return new Hono()
    .get('/config', (c) => c.json(requireBridge().config()))
    .get('/resolve', zValidator('query', ResolveQuerySchema), async (c) => {
      const {spec, importer} = c.req.valid('query')
      return c.json(await requireBridge().resolve(spec, importer))
    })
    .get('/graph', zValidator('query', FileQuerySchema), async (c) =>
      c.json(await requireBridge().moduleGraph(c.req.valid('query').file)),
    )
    .get('/transform', zValidator('query', TransformQuerySchema), async (c) =>
      c.json(await requireBridge().transform(c.req.valid('query').url)),
    )
    .get('/urls', (c) => c.json(requireBridge().urls()))
    .post('/reload', zValidator('json', ReloadBodySchema), async (c) => {
      await requireBridge().reload(c.req.valid('json').file)
      return c.json({ok: true})
    })
    .post('/restart', zValidator('json', RestartBodySchema), async (c) => {
      await requireBridge().restart(c.req.valid('json').force)
      return c.json({ok: true})
    })
}
