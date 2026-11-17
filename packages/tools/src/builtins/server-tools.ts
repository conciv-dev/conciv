import {z} from 'zod'
import {defineTool} from '@conciv/extension/tool'
import {TabsListingSchema, type TabsListing} from '@conciv/protocol/chat-types'

export type TabsToolContext = {listTabs: () => Promise<TabsListing>}

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
