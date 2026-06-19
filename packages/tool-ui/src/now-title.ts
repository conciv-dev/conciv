import {z} from 'zod'
import type {ToolCallPart} from '@tanstack/ai-client'

// Loose hint schema: the few fields the morphing now-line surfaces. Each card validates its input
// fully with its own schema; this is a transient present-tense label read off possibly-partial
// streamed args, so unknown keys are ignored and a partial parse degrades to a generic phrase.
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

// Present-tense verb labels for mandarax_page; mirrors the past-tense titles in the page-action card.
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

// The active tool call's label for the single live "now" line while a turn streams.
export function nowTitle(part: ToolCallPart): string {
  const h = hint(part)
  switch (part.name) {
    case 'Bash':
      return h.command ? `Running ${clip(h.command)}` : 'Running a command'
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return h.file_path ? `Editing ${base(h.file_path)}` : 'Editing a file'
    case 'Read':
    case 'mandarax_open':
      return h.file_path || h.path ? `Reading ${base(h.file_path ?? h.path ?? '')}` : 'Reading a file'
    case 'Grep':
    case 'Glob':
      return h.pattern ? `Searching ${clip(h.pattern, 32)}` : 'Searching'
    case 'TodoWrite':
      return 'Updating tasks'
    case 'mandarax_test':
      return 'Running tests'
    case 'mandarax_ui':
      return 'Rendering UI'
    case 'mandarax_page':
      return (h.verb && PAGE_VERB[h.verb]) || 'Page action'
    default:
      return part.name
  }
}
