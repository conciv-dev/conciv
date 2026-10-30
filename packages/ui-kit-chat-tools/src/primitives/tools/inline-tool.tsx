import {isPlainObject} from 'es-toolkit'
import type {ToolCallPart} from '@conciv/protocol/chat-message-types'

export function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function basename(filepath: string): string {
  const parts = filepath.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? filepath
}

export function shortenPath(filepath: string, depth = 2): string {
  const parts = filepath.split('/').filter(Boolean)
  if (parts.length <= depth) return filepath
  return parts.slice(-depth).join('/')
}

function parsedArguments(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return null
  }
}

export function inlineValue(part: ToolCallPart, argKeys: readonly string[]): string {
  const args = parsedArguments(part.arguments)
  if (!isPlainObject(args)) return ''
  const found = argKeys.map((key) => args[key]).find((value) => typeof value === 'string' && value !== '')
  return typeof found === 'string' ? found : ''
}

export const SUMMARY_KEYS = ['file_path', 'path', 'pattern', 'command', 'query', 'glob', 'url'] as const
