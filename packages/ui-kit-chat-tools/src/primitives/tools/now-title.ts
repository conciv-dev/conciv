import {z} from 'zod'
import type {ToolCallPart} from '@tanstack/ai-client'

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

const PAGE_VERB: Record<string, string> = {
  click: 'Clicking',
  fill: 'Typing',
  select: 'Selecting',
  check: 'Checking',
  uncheck: 'Unchecking',
  press: 'Pressing a key',
  hover: 'Hovering',
  scroll: 'Scrolling',
  submit: 'Submitting',
  find: 'Finding elements',
  locate: 'Locating',
  inspect: 'Inspecting',
  tree: 'Reading the page',
  wait: 'Waiting',
  eval: 'Running a script',
}

type HintData = z.infer<typeof Hint>

const runningTitle = (h: HintData): string => (h.command ? `Running ${clip(h.command)}` : 'Running a command')
const editingTitle = (h: HintData): string => (h.file_path ? `Editing ${base(h.file_path)}` : 'Editing a file')
const readingTitle = (h: HintData): string => {
  const file = h.file_path ?? h.path
  return file ? `Reading ${base(file)}` : 'Reading a file'
}
const searchingTitle = (h: HintData): string => (h.pattern ? `Searching ${clip(h.pattern, 32)}` : 'Searching')
const pageTitle = (h: HintData): string => (h.verb && PAGE_VERB[h.verb]) || 'Page action'

const TITLE_BY_TOOL: Record<string, (h: HintData) => string> = {
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

export function nowTitle(part: ToolCallPart, titleByName: Record<string, string> = {}): string {
  const supplied = titleByName[part.name]
  if (supplied) return supplied
  const title = TITLE_BY_TOOL[part.name]
  return title ? title(hint(part)) : humanToolName(part.name)
}
