import type {ToolCallPart} from '@tanstack/ai-client'

// Headless helpers for compact, single-line tool displays (ported from with-opencode tool-ui-inline).
// Pure string logic only — the styled inlineTool factory adds the row + status icon + tokens.

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

// First non-empty string arg among `argKeys` (parseInput reads part.arguments — part.input is empty).
export function inlineValue(part: ToolCallPart, argKeys: readonly string[]): string {
  try {
    const args = JSON.parse(part.arguments || '{}')
    for (const key of argKeys) {
      const value = args[key]
      if (typeof value === 'string' && value) return value
    }
    return ''
  } catch {
    return ''
  }
}

// Arg keys the generic inline fallback probes, in priority order.
export const SUMMARY_KEYS = ['file_path', 'path', 'pattern', 'command', 'query', 'glob', 'url'] as const
