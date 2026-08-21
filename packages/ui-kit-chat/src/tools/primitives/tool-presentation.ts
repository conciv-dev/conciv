import type {FileOptions} from '@conciv/solid-diffs'
import {codeTheme} from '../../theme/code-theme.js'
import type {ToolStatus} from './tool-status.js'

export type CardPhase = 'running' | 'done'

export const MUTATING_BADGE = 'edits page'

export const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 [color:var(--chat-text-3)]'

export const DANGER_TEXT_CLASS =
  'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)] whitespace-pre-wrap [overflow-wrap:anywhere] [color:var(--chat-danger)] [font-family:var(--chat-mono)] m-0'

export function codeBlockOptions(): FileOptions<undefined> {
  return {
    theme: codeTheme(),
    themeType: 'system',
    disableFileHeader: true,
    disableLineNumbers: true,
    overflow: 'wrap',
  }
}

export function codeLineOptions(): FileOptions<undefined> {
  return {...codeBlockOptions(), overflow: 'scroll'}
}

export function codeBlockFileChromeOptions(): FileOptions<undefined> {
  return {
    ...codeBlockOptions(),
    disableFileHeader: false,
    disableLineNumbers: false,
  }
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
