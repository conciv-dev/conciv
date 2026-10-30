import {toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {z} from 'zod'
import {unreadableMessage} from '../../server/adapters/image.js'
import {captureDef, ViewportResultSchema, type TargetInput, type TargetResult} from '../../shared/defs.js'
import type {Enricher, Raster, ServerStep, TargetNode} from '../../shared/types.js'

const PageRouteSchema = z.object({pathname: z.string(), search: z.string()})

export async function liveRoute(page: ServerToolPageAccess): Promise<string> {
  const {pathname, search} = PageRouteSchema.parse(await page.call('page_route', {}))
  return `${pathname}${search}`
}

async function enrich(input: {node: TargetNode; raster: Raster; enrichers: Enricher[]}): Promise<TargetNode> {
  const {raster, enrichers} = input
  const own = await enrichers.reduce<Promise<TargetNode>>(async (pending, enricher) => {
    const node = await pending
    if (!enricher.applies(node)) return node
    return {...node, ...(await enricher.run({node, raster}))}
  }, Promise.resolve(input.node))
  const children = await Promise.all(own.children.map((node) => enrich({node, raster, enrichers})))
  return {...own, children}
}

export async function targetWidth(input: {width: number | undefined; page: ServerToolPageAccess}): Promise<number> {
  if (input.width !== undefined) return input.width
  return ViewportResultSchema.parse(await input.page.call(captureDef.name, {probe: true})).width
}

export const targetStep: ServerStep<TargetInput, TargetResult> = async (input, ctx, _request, page) => {
  const {design} = ctx
  const width = await targetWidth({width: input.width, page})
  const route = input.route ?? (await liveRoute(page))
  const adapter = design.adapters.find((candidate) => candidate.accepts({ref: input.image, cwd: design.cwd}))
  if (adapter === undefined) {
    throw toolError('image-unreadable', {message: unreadableMessage(input.image)})
  }
  const model = await adapter.load({ref: input.image, width, cwd: design.cwd})
  const root = await enrich({node: model.root, raster: model.raster, enrichers: design.enrichers})
  const record = await design.store.put({
    model: {...model, root},
    route,
    width,
    ...(input.name === undefined ? {} : {name: input.name}),
  })
  return {id: record.id, route: record.route, width: record.width, height: record.height, scale: record.scale}
}
