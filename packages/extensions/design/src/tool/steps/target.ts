import {toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {z} from 'zod'
import {unreadableMessage} from '../../server/adapters/image.js'
import {DESIGN_GUIDE, type TargetInput, type TargetResult} from '../../shared/defs.js'
import {TEXT_ENRICHER} from '../../server/enrichers.js'
import type {DesignRuntime, TargetModel} from '../../shared/types.js'

const PageRouteSchema = z.object({pathname: z.string(), search: z.string()})

export async function liveRoute(page: ServerToolPageAccess): Promise<string> {
  const {pathname, search} = PageRouteSchema.parse(await page.call('page_route', {}))
  return `${pathname}${search}`
}

export function pathnameIn(route: string): string {
  return route.split('?')[0] ?? route
}

async function routeLabel(input: {route: string | undefined; page: ServerToolPageAccess}): Promise<string | undefined> {
  if (input.route !== undefined) return input.route
  return liveRoute(input.page).then(pathnameIn, () => undefined)
}

type Enriched = {model: TargetModel; failures: Record<string, string>}

async function enrich(input: {model: TargetModel; design: DesignRuntime}): Promise<Enriched> {
  const {design} = input
  return design.enrichers.reduce<Promise<Enriched>>(
    async (pending, enricher) => {
      const {model, failures} = await pending
      try {
        const nodes = await enricher.run({model, raster: model.raster, runtime: design})
        return {model: {...model, nodes}, failures}
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {model, failures: {...failures, [enricher.name]: message}}
      }
    },
    Promise.resolve({model: input.model, failures: {}}),
  )
}

function textResult(enriched: Enriched): NonNullable<TargetResult['text']> {
  const runs = enriched.model.nodes.filter((node) => node.kind === 'text').length
  const error = enriched.failures[TEXT_ENRICHER]
  return error === undefined ? {runs} : {runs, error}
}

export async function registerTarget(request: {
  input: TargetInput
  session: string
  design: DesignRuntime
  page: ServerToolPageAccess
}): Promise<TargetResult> {
  const {input, session, design, page} = request
  const adapter = design.adapters.find((candidate) => candidate.accepts({ref: input.image, cwd: design.cwd}))
  if (adapter === undefined) {
    throw toolError('image-unreadable', {message: unreadableMessage(input.image)})
  }
  const loaded = await adapter.load({ref: input.image, scale: input.scale ?? 1, cwd: design.cwd})
  const enriched = await enrich({model: loaded, design})
  const route = await routeLabel({route: input.route, page})
  const record = await design.store.put({
    model: enriched.model,
    session,
    ...(route === undefined ? {} : {route}),
    ...(input.name === undefined ? {} : {name: input.name}),
  })
  return {
    id: record.id,
    ...(record.route === undefined ? {} : {route: record.route}),
    width: record.width,
    height: record.height,
    scale: record.scale,
    text: textResult(enriched),
    next: DESIGN_GUIDE,
  }
}
