import type {ToolRowMark, ToolRowProjection, ToolRowProps} from '@conciv/protocol/tool-view-types'
import type {ToolCallPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from './tool-status.js'

const MARK_OF_STATUS: Record<ToolStatus, ToolRowMark> = {
  running: 'run',
  approval: 'run',
  error: 'fail',
  complete: 'pass',
}

export function rowMarkOf(part: ToolCallPart, result: Parameters<typeof toolStatus>[1]): ToolRowMark {
  return MARK_OF_STATUS[toolStatus(part, result)]
}

const PLURAL_RULES = new Intl.PluralRules('en')

export function countLabel(count: number, one: string, other: string): string {
  return `${count} ${PLURAL_RULES.select(count) === 'one' ? one : other}`
}

const MAX_LABEL_LENGTH = 9
const MAX_TARGET_LENGTH = 160

const VERB_ALIASES: Record<string, string> = {
  execute: 'exec',
  exec: 'exec',
  eval: 'exec',
  evaluate: 'exec',
  run: 'run',
  read: 'read',
  write: 'write',
  edit: 'edit',
  search: 'search',
  grep: 'search',
  find: 'find',
  list: 'list',
  get: 'get',
  set: 'set',
  open: 'open',
  fetch: 'fetch',
  navigate: 'nav',
  screenshot: 'shot',
}

function abbreviate(word: string): string {
  return word.length <= MAX_LABEL_LENGTH ? word : `${word.slice(0, MAX_LABEL_LENGTH - 1)}…`
}

function labelCandidates(raw: string, tokens: string[]): string[] {
  const last = tokens[tokens.length - 1] ?? raw
  const lastTwo = tokens.length > 1 ? `${tokens[tokens.length - 2]}_${last}` : last
  return [raw, lastTwo, last]
}

export function shortToolLabel(name: string): string {
  const segments = name.split(/__|\./).filter(Boolean)
  const raw = (segments[segments.length - 1] ?? name).toLowerCase()
  const tokens = raw.split(/[_-]/).filter(Boolean)
  const alias = VERB_ALIASES[raw] ?? VERB_ALIASES[tokens[0] ?? raw] ?? VERB_ALIASES[tokens[tokens.length - 1] ?? raw]
  if (alias) return alias
  const candidates = labelCandidates(raw, tokens)
  return candidates.find((candidate) => candidate.length <= MAX_LABEL_LENGTH) ?? abbreviate(candidates[2] ?? raw)
}

const TARGET_KEYS = [
  'command',
  'file_path',
  'filePath',
  'path',
  'file',
  'pattern',
  'query',
  'url',
  'selector',
  'name',
  'text',
  'prompt',
]

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function clipTarget(value: string): string {
  const collapsed = collapseWhitespace(value)
  return collapsed.length <= MAX_TARGET_LENGTH ? collapsed : `${collapsed.slice(0, MAX_TARGET_LENGTH - 1)}…`
}

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function primaryArgument(part: ToolCallPart): string {
  try {
    const parsed: unknown = JSON.parse(part.arguments || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ''
    const input = parsed as Record<string, unknown>
    const preferred = TARGET_KEYS.map((key) => stringField(input, key)).find((value) => value !== undefined)
    const fallback = Object.values(input).find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )
    const chosen = preferred ?? fallback
    return chosen === undefined ? '' : clipTarget(chosen)
  } catch {
    return ''
  }
}

export function genericRowProjection(source: ToolRowProps): ToolRowProjection {
  return {
    mark: rowMarkOf(source.part, source.result),
    label: shortToolLabel(source.part.name),
    target: primaryArgument(source.part) || source.part.name,
  }
}
