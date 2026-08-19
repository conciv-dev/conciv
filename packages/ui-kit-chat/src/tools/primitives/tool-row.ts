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

const MAX_LABEL_LENGTH = 12
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

const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g
const ACRONYM_BOUNDARY = /([A-Z]+)([A-Z][a-z])/g

function labelTokens(segment: string): string[] {
  return segment
    .replace(ACRONYM_BOUNDARY, '$1_$2')
    .replace(CAMEL_BOUNDARY, '$1_$2')
    .toLowerCase()
    .split(/[_-]/)
    .filter(Boolean)
}

export function shortToolLabel(name: string): string {
  const segments = name.split(/__|\./).filter(Boolean)
  const tokens = labelTokens(segments[segments.length - 1] ?? name)
  const raw = tokens.join('_')
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

function argumentRecord(part: ToolCallPart): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(part.arguments || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return {...parsed}
  } catch {
    return {}
  }
}

export function namedArgument(part: ToolCallPart): string | undefined {
  const input = argumentRecord(part)
  const named = TARGET_KEYS.map((key) => stringField(input, key)).find((value) => value !== undefined)
  return named === undefined ? undefined : clipTarget(named)
}

export function primaryArgument(part: ToolCallPart): string {
  const named = namedArgument(part)
  if (named !== undefined) return named
  const loose = Object.values(argumentRecord(part)).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  return loose === undefined ? '' : clipTarget(loose)
}

export function genericRowProjection(source: ToolRowProps): ToolRowProjection {
  return {
    mark: rowMarkOf(source.part, source.result),
    label: shortToolLabel(source.part.name),
    target: primaryArgument(source.part) || source.part.name,
  }
}

export type EmbeddedCardHeader = {
  title: string
  meta?: string
  status?: ToolStatus
}

function filled(value: string | undefined): string | undefined {
  const text = value === undefined ? '' : collapseWhitespace(value)
  return text.length > 0 ? text : undefined
}

export function headerRowProjection(header: EmbeddedCardHeader, source: ToolRowProps): ToolRowProjection {
  const title = filled(header.title)
  if (title === undefined) return genericRowProjection(source)
  return {
    mark: header.status === undefined ? rowMarkOf(source.part, source.result) : MARK_OF_STATUS[header.status],
    label: shortToolLabel(source.part.name),
    target: namedArgument(source.part) ?? clipTarget(title),
    meta: filled(header.meta),
  }
}
