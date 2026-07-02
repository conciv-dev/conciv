import {type H3, getValidatedQuery, readValidatedBody} from 'h3'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'

export function registerServerRoutes(app: H3, bridge: BundlerBridge): void {
  app.get('/api/server/config', () => bridge.config())

  app.get('/api/server/resolve', async (event) => {
    const {spec, importer} = await getValidatedQuery(event, ResolveQuerySchema)
    return bridge.resolve(spec, importer)
  })

  app.get('/api/server/graph', async (event) => {
    const {file} = await getValidatedQuery(event, FileQuerySchema)
    return bridge.moduleGraph(file)
  })

  app.get('/api/server/transform', async (event) => {
    const {url} = await getValidatedQuery(event, TransformQuerySchema)
    return bridge.transform(url)
  })

  app.get('/api/server/urls', () => bridge.urls())

  app.post('/api/server/reload', async (event) => {
    const {file} = await readValidatedBody(event, ReloadBodySchema)
    await bridge.reload(file)
    return {ok: true}
  })

  app.post('/api/server/restart', async (event) => {
    const {force} = await readValidatedBody(event, RestartBodySchema)
    await bridge.restart(force)
    return {ok: true}
  })
}

const ResolveQuerySchema = z.object({spec: z.string(), importer: z.string().optional()})
const FileQuerySchema = z.object({file: z.string()})
const TransformQuerySchema = z.object({url: z.string()})
const ReloadBodySchema = z.object({file: z.string()})
const RestartBodySchema = z.object({force: z.boolean().default(false)})
