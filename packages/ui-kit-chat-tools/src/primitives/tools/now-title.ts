import {z} from 'zod'
import type {ToolCallPart} from '@tanstack/ai-client'
import {PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import type {ToolCatalogView, ToolViewMeta} from '@conciv/protocol/tool-view-types'

const Hint = z.object({
  command: z.string().optional(),
  file_path: z.string().optional(),
  path: z.string().optional(),
  pattern: z.string().optional(),
  verb: z.string().optional(),
})

function hint(part: ToolCallPart): z.infer<typeof Hint> {
  const parsed = Hint.safeParse(part.input)
  return parsed.success ? parsed.data : {}
}

function clip(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function base(file: string): string {
  return file.split('/').slice(-1)[0] ?? file
}

export function humanToolName(name: string): string {
  const mcp = name.match(/^mcp__(.+?)__(.+)$/)
  if (mcp?.[2]) return mcp[2].replaceAll('_', ' ')
  return name
}

const GENERIC_PAGE_TITLE = 'Page action'

export type PageToolView =
  | {state: 'pending'; verb: string}
  | {state: 'unlisted'}
  | {state: 'listed'; verb: string; meta: ToolViewMeta}

export function pageToolView(catalog: ToolCatalogView, verb: string | undefined): PageToolView {
  if (verb === undefined) return {state: 'unlisted'}
  if (!catalog.loaded()) return {state: 'pending', verb}
  const meta = catalog.meta(`${PAGE_TOOL_PREFIX}${verb}`)
  if (meta === undefined) return {state: 'unlisted'}
  return {state: 'listed', verb, meta}
}

export function pageToolTitle(view: PageToolView, phase: 'running' | 'done'): string {
  if (view.state === 'unlisted') return GENERIC_PAGE_TITLE
  if (view.state === 'pending') return humanToolName(view.verb)
  return view.meta.label?.[phase] || view.meta.summary || humanToolName(view.verb)
}

type HintData = z.infer<typeof Hint>

const runningTitle = (h: HintData): string => (h.command ? `Running ${clip(h.command)}` : 'Running a command')
const editingTitle = (h: HintData): string => (h.file_path ? `Editing ${base(h.file_path)}` : 'Editing a file')
const readingTitle = (h: HintData): string => {
  const file = h.file_path ?? h.path
  return file ? `Reading ${base(file)}` : 'Reading a file'
}
const searchingTitle = (h: HintData): string => (h.pattern ? `Searching ${clip(h.pattern, 32)}` : 'Searching')
const pageTitle = (h: HintData, catalog: ToolCatalogView): string =>
  pageToolTitle(pageToolView(catalog, h.verb), 'running')

const TITLE_BY_TOOL: Record<string, (h: HintData, catalog: ToolCatalogView) => string> = {
  Bash: runningTitle,
  Edit: editingTitle,
  MultiEdit: editingTitle,
  Write: editingTitle,
  Read: readingTitle,
  conciv_open: readingTitle,
  Grep: searchingTitle,
  Glob: searchingTitle,
  TodoWrite: () => 'Updating tasks',
  conciv_ui: () => 'Rendering UI',
  conciv_page: pageTitle,
}

export function nowTitle(
  part: ToolCallPart,
  catalog: ToolCatalogView,
  titleByName: Record<string, string> = {},
): string {
  const supplied = titleByName[part.name]
  if (supplied) return supplied
  const title = TITLE_BY_TOOL[part.name]
  if (!title) return humanToolName(part.name)
  return title(hint(part), catalog)
}
