import {z} from 'zod'
import {
  captureDef,
  ViewportResultSchema,
  type CaptureInput,
  type CaptureResult,
  type ViewportResult,
} from '../../shared/defs.js'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {ServerStep} from '../../shared/types.js'
import {encodePng} from '../../server/raster.js'

const PageRouteSchema = z.object({pathname: z.string(), search: z.string()})

async function liveViewport({input, page}: {input: CaptureInput; page: ServerToolPageAccess}): Promise<ViewportResult> {
  if (input.width !== undefined && input.height !== undefined) return {width: input.width, height: input.height}
  const probe = ViewportResultSchema.parse(await page.call(captureDef.name, {probe: true}))
  return {width: input.width ?? probe.width, height: input.height ?? probe.height}
}

export const captureStep: ServerStep<CaptureInput, CaptureResult | ViewportResult> = async (
  input,
  ctx,
  _request,
  page,
) => {
  if (input.probe === true || input.clear === true) {
    return ViewportResultSchema.parse(await page.call(captureDef.name, input))
  }
  const viewport = await liveViewport({input, page})
  const route = PageRouteSchema.parse(await page.call('page_route', {}))
  const live = await ctx.design.capture.capture({
    route: route.pathname + route.search,
    width: viewport.width,
    height: viewport.height,
    page,
  })
  const path = await ctx.design.store.writeCapture({png: encodePng(live.raster)})
  return {path, width: live.raster.width, height: live.raster.height, route: live.route, components: live.components}
}
