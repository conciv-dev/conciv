import {z} from 'zod'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolCatalogView} from '@conciv/protocol/tool-view-types'

const Hint = z.object({
  command: z.string().optional(),
  file_path: z.string().optional(),
  path: z.string().optional(),
  pattern: z.string().optional(),
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

type HintData = z.infer<typeof Hint>

const runningTitle = (h: HintData): string => (h.command ? `Running ${clip(h.command)}` : 'Running a command')
const editingTitle = (h: HintData): string => (h.file_path ? `Editing ${base(h.file_path)}` : 'Editing a file')
const readingTitle = (h: HintData): string => {
  const file = h.file_path ?? h.path
  return file ? `Reading ${base(file)}` : 'Reading a file'
}
const searchingTitle = (h: HintData): string => (h.pattern ? `Searching ${clip(h.pattern, 32)}` : 'Searching')

const TITLE_BY_TOOL: Record<string, (h: HintData) => string> = {
  Bash: runningTitle,
  Edit: editingTitle,
  MultiEdit: editingTitle,
  Write: editingTitle,
  Read: readingTitle,
  Grep: searchingTitle,
  Glob: searchingTitle,
  TodoWrite: () => 'Updating tasks',
}

export function nowTitle(
  part: ToolCallPart,
  catalog: ToolCatalogView,
  titleByName: Record<string, string> = {},
): string {
  const supplied = titleByName[part.name]
  if (supplied) return supplied
  const declared = catalog.meta(part.name)?.label?.running
  if (declared) return declared
  const title = TITLE_BY_TOOL[part.name]
  if (!title) return humanToolName(part.name)
  return title(hint(part))
}
