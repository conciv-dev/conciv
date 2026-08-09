import type {FileOptions} from '@conciv/solid-diffs'
import type {ToolStatus} from './tool-status.js'

export type CardPhase = 'running' | 'done'

export const MUTATING_BADGE = 'edits page'

export const DANGER_TEXT_CLASS =
  'text-[length:var(--chat-text-sm)] whitespace-pre-wrap [color:var(--chat-danger)] [font-family:var(--chat-mono)] m-0'

export const CODE_BLOCK_CLASS =
  'block w-full max-h-[13.75rem] overflow-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]'

export const CODE_BLOCK_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
  overflow: 'wrap',
}

export function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value) ?? String(value)
}

export function clip(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function cardPhase(status: ToolStatus): CardPhase {
  return status === 'complete' || status === 'error' ? 'done' : 'running'
}

export function cardTitle(
  meta: {label?: {running: string; done: string}; summary?: string} | undefined,
  phase: CardPhase,
  fallbackName: string,
): string {
  return meta?.label?.[phase] || meta?.summary || fallbackName
}
