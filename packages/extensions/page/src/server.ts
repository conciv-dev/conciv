import {z} from 'zod'
import {defineExtension, type AnyToolBuilder} from '@conciv/extension'
import {RawFrameSchema, type RawFrame, type SourceLoc} from '@conciv/protocol/page-types'
import {locateDef, PAGE_EXTENSION_NAME, PAGE_TOOL_DEFS} from './shared/defs.js'
import {grabAttachment} from './server/grab-attachment.js'

export type PageServerContext = {
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>
}

const LocateFramesSchema = z.array(RawFrameSchema)

const LocateResultSchema = z.looseObject({
  source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
  frames: z.array(z.unknown()).optional(),
})

const locateServer = locateDef.server(async (input, ctx: PageServerContext, _request, page) => {
  const data = LocateResultSchema.parse(await page.call(locateDef.name, input))
  if (data.source) return data
  const frames = LocateFramesSchema.safeParse(data.frames)
  if (!frames.success || frames.data.length === 0) return data
  return {...data, source: await ctx.symbolicate(frames.data)}
})

const declarations: AnyToolBuilder[] = PAGE_TOOL_DEFS.map((def) => (def === locateDef ? locateServer : def.client()))

export const page = defineExtension({
  name: PAGE_EXTENSION_NAME,
  tools: declarations,
  attachments: [grabAttachment],
}).server((server) => ({
  context: {symbolicate: server.symbolicate},
}))

export default page
