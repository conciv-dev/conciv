import {z} from 'zod'
import {defineExtension, type AnyToolBuilder, type ServerPageCaller} from '@conciv/extension'
import {RawFrameSchema, type RawFrame, type SourceLoc} from '@conciv/protocol/page-types'
import {locateDef, PAGE_EXTENSION_NAME, PAGE_TOOL_DEFS} from './shared/defs.js'

export type PageServerContext = {
  page: ServerPageCaller
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>
}

const LocateFramesSchema = z.array(RawFrameSchema)

const locateServer = locateDef.server(async (input, ctx: PageServerContext) => {
  const data = await ctx.page.call(locateDef.name, input)
  if (data.source) return data
  const frames = LocateFramesSchema.safeParse(data.frames)
  if (!frames.success || frames.data.length === 0) return data
  return {...data, source: await ctx.symbolicate(frames.data)}
})

const declarations: AnyToolBuilder[] = PAGE_TOOL_DEFS.map((def) => (def === locateDef ? locateServer : def.client()))

export const page = defineExtension({name: PAGE_EXTENSION_NAME, tools: declarations}).server((server) => ({
  context: {page: server.page, symbolicate: server.symbolicate},
}))

export default page
