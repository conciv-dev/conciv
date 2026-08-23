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

const PAGE_PROMPT =
  'Drive the live page through the dedicated page capabilities: read it with page.snapshot, page.text, page.value, page.query and page.console, act on it with page.click, page.fill, page.select, page.check, page.press and page.reload, restyle it with page.setstyle, page.addclass, page.settext and page.css, and inspect React with page.inspect, page.tree, page.locate and page.find. Search the capability catalog for the verb you need before reaching for page.eval: it is the last resort for what none of the others can express, and it asks the user for approval on every call.'

export const page = defineExtension({
  name: PAGE_EXTENSION_NAME,
  tools: declarations,
  systemPrompt: PAGE_PROMPT,
  attachments: [grabAttachment],
}).server((server) => ({
  context: {symbolicate: server.symbolicate},
}))

export default page
