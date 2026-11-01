import {z} from 'zod'
import {BoxSchema, captureDef, GlyphSchema, LiveStylesSchema, SourceLocSchema} from '../../shared/defs.js'
import type {Capture, LiveComponent} from '../../shared/types.js'
import {TOLERANCES} from '../../shared/tolerances.js'
import {decodePng} from '../raster.js'

const CAPTURE_TIMEOUT_MS = TOLERANCES.frameSettleMs + TOLERANCES.captureBudgetMs

const LiveComponentTreeSchema: z.ZodType<LiveComponent> = z.object({
  source: SourceLocSchema.nullable(),
  tag: z.string(),
  text: z.string(),
  box: BoxSchema,
  textBox: BoxSchema.nullable(),
  glyphs: z.array(GlyphSchema),
  axis: z.enum(['row', 'column']).nullable(),
  styles: LiveStylesSchema,
  index: z.number(),
  get children() {
    return z.array(LiveComponentTreeSchema)
  },
})

const ClientCaptureSchema = z.object({
  image: z.string(),
  width: z.number(),
  height: z.number(),
  route: z.string(),
  components: z.array(LiveComponentTreeSchema),
})

export const tabCapture: Capture = {
  name: 'tab',
  capture: async ({width, height, page}) => {
    const shot = ClientCaptureSchema.parse(
      await page.call(captureDef.name, {width, height, timeout: CAPTURE_TIMEOUT_MS}),
    )
    return {
      raster: decodePng(Buffer.from(shot.image, 'base64')),
      viewport: {width: shot.width, height: shot.height},
      route: shot.route,
      components: shot.components,
    }
  },
  clear: async ({page}) => {
    await page.call(captureDef.name, {clear: true})
  },
}
