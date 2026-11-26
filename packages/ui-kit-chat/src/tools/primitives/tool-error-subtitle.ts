import {z} from 'zod'
import {uniq} from 'es-toolkit'
import type {ToolProps} from '@conciv/frontend-plugin-api'

const Text = z.string().min(1)

const ChangedFileSchema = z.object({
  file: z.string(),
  patch: z.string(),
  additions: z.number(),
  deletions: z.number(),
  status: z.enum(['added', 'deleted', 'modified']),
})

const QuestionSchema = z.object({question: z.string()})

const ListSchema = z.array(z.unknown()).catch([])

const TOOL_TITLES: Readonly<Record<string, string>> = {
  read: 'Read',
  list: 'List',
  glob: 'Glob',
  grep: 'Grep',
  subagent: 'Agent',
  webfetch: 'Webfetch',
  websearch: 'Web Search',
  shell: 'Shell',
  execute: 'Execute',
  edit: 'Edit',
  write: 'Write',
  skill: 'Skill',
  patch: 'Patch',
  question: 'Questions',
}

const WEB_SEARCH_PROVIDERS: Readonly<Record<string, string>> = {
  tinyfish: 'TinyFish',
  opencode: 'OpenCode',
}

const PLURAL = new Intl.PluralRules('en')

const NOUNS = {file: {one: 'file', other: 'files'}, question: {one: 'question', other: 'questions'}}

function text(value: unknown): string | undefined {
  const parsed = Text.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function counted(count: number, noun: keyof typeof NOUNS): string | undefined {
  if (count === 0) return undefined
  return `${count} ${PLURAL.select(count) === 'one' ? NOUNS[noun].one : NOUNS[noun].other}`
}

function getFilename(path: string | undefined): string {
  if (!path) return ''
  const trimmed = path.replace(/[/\\]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return trimmed.slice(index + 1)
}

function getDirectory(path: string | undefined): string {
  if (!path) return ''
  const trimmed = path.replace(/[/\\]+$/, '')
  const parts = trimmed.split(/[/\\]/)
  return `${parts.slice(0, -1).join('/')}/`
}

export function toolErrorTitle(tool: string): string {
  return (Object.hasOwn(TOOL_TITLES, tool) ? TOOL_TITLES[tool] : undefined) ?? tool
}

export function webSearchProviderLabel(provider: string | undefined): string {
  if (!provider) return 'Web Search'
  const name =
    (Object.hasOwn(WEB_SEARCH_PROVIDERS, provider) ? WEB_SEARCH_PROVIDERS[provider] : undefined) ??
    `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`
  return `${name} Web Search`
}

export function toolErrorSubtitle(call: Pick<ToolProps, 'tool' | 'input' | 'metadata'>): string | undefined {
  const input = call.input
  const metadata = call.metadata
  if (call.tool === 'shell') return text(input.command) ?? text(metadata.command)
  if (call.tool === 'read' || call.tool === 'edit' || call.tool === 'write') return getFilename(text(input.path))
  if (call.tool === 'list' || call.tool === 'glob' || call.tool === 'grep') return getDirectory(text(input.path) ?? '/')
  if (call.tool === 'webfetch') return text(input.url)
  if (call.tool === 'websearch') return text(input.query)
  if (call.tool === 'skill') return text(metadata.name) ?? text(input.id) ?? text(input.name)
  if (call.tool === 'patch') {
    const files = ListSchema.parse(metadata.files).flatMap((file) => {
      const parsed = ChangedFileSchema.safeParse(file)
      return parsed.success ? [parsed.data.file] : []
    })
    return counted(uniq(files).length, 'file')
  }
  if (call.tool === 'question')
    return counted(
      ListSchema.parse(input.questions).filter((item) => QuestionSchema.safeParse(item).success).length,
      'question',
    )
  return undefined
}
