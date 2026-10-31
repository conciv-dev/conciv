import {randomUUID} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {defineExtension, imageResult, type AnyToolBuilder} from '@conciv/extension'
import {CONCIV_STATE_DIR} from '@conciv/protocol/state-types'
import {RawFrameSchema, type RawFrame, type SourceLoc} from '@conciv/protocol/page-types'
import {locateDef, PAGE_EXTENSION_NAME, PAGE_TOOL_DEFS, PageScreenshotSchema, screenshotDef} from './shared/defs.js'
import {grabAttachment} from './server/grab-attachment.js'

export type PageServerContext = {
  cwd: string
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

const screenshotServer = screenshotDef.server(async (input, ctx: PageServerContext, _request, page) => {
  const {image, width, height} = PageScreenshotSchema.parse(await page.call(screenshotDef.name, input))
  const path = join(CONCIV_STATE_DIR, 'tmp', 'screenshots', `${randomUUID()}.webp`)
  await mkdir(dirname(join(ctx.cwd, path)), {recursive: true})
  await writeFile(join(ctx.cwd, path), Buffer.from(image, 'base64'))
  return imageResult('image/webp', image, {width, height, path})
})

const SERVER_STEPS: Record<string, AnyToolBuilder> = {
  [locateDef.name]: locateServer,
  [screenshotDef.name]: screenshotServer,
}

const declarations: AnyToolBuilder[] = PAGE_TOOL_DEFS.map((def) => SERVER_STEPS[def.name] ?? def.client())

const PAGE_PROMPT =
  'Drive the live page through the dedicated page capabilities: read it with page_snapshot, page_screenshot, page_text, page_value, page_query and page_console, after editing a file wait for the hot update to land with page_hmr before reading the page, act on it with page_click, page_fill, page_select, page_check, page_press and page_reload, restyle it with page_setstyle, page_addclass, page_settext and page_css, and inspect React with page_inspect, page_tree, page_locate and page_find. Search the capability catalog for the verb you need before reaching for page_eval: it is the last resort for what none of the others can express, and it asks the user for approval on every call.'

export const page = defineExtension({
  name: PAGE_EXTENSION_NAME,
  tools: declarations,
  systemPrompt: PAGE_PROMPT,
  attachments: [grabAttachment],
}).server((server) => ({
  context: {cwd: server.cwd, symbolicate: server.symbolicate},
}))

export default page
