import {z} from 'zod'
import {defineTool, toolError} from '@conciv/extension/tool'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {TabsListingSchema, type SessionId, type TabsListing} from '@conciv/protocol/chat-types'
import type {BuiltinCategory} from './shared.js'

type HotUpdateWait = {applied: boolean; waitedMs: number}

export type ServerToolContext = {
  bundler: () => BundlerBridge | undefined
  hotUpdate: (sessionId: SessionId, timeout: number) => Promise<HotUpdateWait>
}

export type TabsToolContext = {listTabs: () => Promise<TabsListing>}

const NO_BUNDLER_MESSAGE = 'no dev server is attached to conciv'

const NO_BUNDLER = {NO_BUNDLER: {message: NO_BUNDLER_MESSAGE}}

function requireBundler(ctx: ServerToolContext): BundlerBridge {
  const bundler = ctx.bundler()
  if (!bundler) throw toolError('NO_BUNDLER', {message: NO_BUNDLER_MESSAGE})
  return bundler
}

function serverTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  operation: string
  summary: string
  input: z.ZodObject<Shape>
  output: Out
  mutating?: boolean
  approval?: 'ask'
  positional?: string
  keywords?: readonly string[]
  run: (
    input: z.infer<z.ZodObject<Shape>>,
    bundler: BundlerBridge,
    hotUpdate: () => Promise<HotUpdateWait>,
  ) => Promise<z.infer<Out>> | z.infer<Out>
}) {
  const category: BuiltinCategory = 'server'
  return defineTool({
    name: `server_${spec.operation}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: spec.output,
    errors: NO_BUNDLER,
    approval: spec.approval,
    meta: {
      summary: spec.summary,
      category,
      mutating: spec.mutating ?? false,
      keywords: spec.keywords ?? [],
      positional: spec.positional,
    },
  }).server((input, ctx: ServerToolContext, request) =>
    spec.run(input, requireBundler(ctx), () => waitForHotUpdate(ctx, request.sessionId)),
  )
}

const HOT_UPDATE_WAIT_MS = 5000

const NOT_WAITED: HotUpdateWait = {applied: false, waitedMs: 0}

function waitForHotUpdate(ctx: ServerToolContext, sessionId: SessionId): Promise<HotUpdateWait> {
  return ctx.hotUpdate(sessionId, HOT_UPDATE_WAIT_MS).catch(() => NOT_WAITED)
}

const reloadTool = serverTool({
  operation: 'reload',
  summary: 'force a hot update of one module',
  mutating: true,
  approval: 'ask',
  positional: 'file',
  keywords: ['hmr'],
  input: z.object({file: z.string().describe('the file to reload')}),
  output: z.object({
    ok: z.literal(true),
    applied: z.boolean().describe('the page applied the hot update before this returned'),
    waitedMs: z.number(),
  }),
  run: async (input, bundler, hotUpdate): Promise<{ok: true; applied: boolean; waitedMs: number}> => {
    await bundler.reload(input.file)
    return {ok: true, ...(await hotUpdate())}
  },
})

export const BUILTIN_SERVER_TOOL = {
  server_reload: reloadTool,
} as const

export const BUILTIN_SERVER_TOOLS = Object.values(BUILTIN_SERVER_TOOL)

const TABS_GUIDANCE =
  'conciv tabs are live web pages running the conciv widget. When the user refers to a conciv tab, session or page in words, call external_tabs({}) and match their words against project, branch, root, href, pageTitle and sessionTitle. If exactly one tab matches, use it and tell the user which one you picked (project, branch, URL). If more than one matches, do not guess: ask the user which one, naming the field that differs. Prefer a tab whose state is visible only when the user says "this one" or "the one I have open". If none match, say so and list what is open. Then pass the id of that tab as tab on every execute_typescript and discover_tools call; the first reply for a tab starts with its instructions, follow them. When a session has more than one browser tab (browserTabs lists each with its href), calls go to the one focused last, which is the first listed; tell the user which one (href). If a call says you are waiting for the user to allow it, tell the user to click Approve in that conciv tab, then retry; if it says the user denied you access, stop and tell the user, do not retry. If a call says the tab is not open, call external_tabs({}) again.'

const TABS_SUMMARY = 'list the open conciv tabs of every running conciv engine on this machine'

export const BUILTIN_TABS_TOOL = defineTool({
  name: 'tabs',
  description: TABS_SUMMARY,
  inputSchema: z.object({}),
  outputSchema: TabsListingSchema,
  meta: {
    summary: TABS_SUMMARY,
    hint: TABS_GUIDANCE,
    category: 'read',
    mutating: false,
    keywords: ['sessions', 'pages'],
  },
}).server((_input, ctx: TabsToolContext) => ctx.listTabs())
