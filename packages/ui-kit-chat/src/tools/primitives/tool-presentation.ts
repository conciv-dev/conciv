import type {FileOptions} from '@conciv/solid-diffs'
import type {ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {StatusDotTone} from '@conciv/ui-kit-system'
import {codeTheme} from '../../theme/code-theme.js'
import type {ToolStatus} from './tool-status.js'

export type CardPhase = 'running' | 'done'

export const MUTATING_BADGE = 'page edit'

export const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 [color:var(--chat-text-3)]'

export const OUTCOME_LABEL: Record<NonNullable<ToolResultPart['outcome']> | 'error', string> = {
  error: 'Error',
  denied: 'Denied',
  cancelled: 'Cancelled',
}

export const OUTCOME_TONE: Record<
  NonNullable<ToolResultPart['outcome']> | 'error',
  {text: string; dot: StatusDotTone}
> = {
  error: {text: 'text-chat-danger', dot: 'danger'},
  denied: {text: 'text-chat-warn', dot: 'warn'},
  cancelled: {text: 'text-chat-dim', dot: 'dim'},
}

export const DANGER_TEXT_CLASS =
  'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)] whitespace-pre-wrap [overflow-wrap:anywhere] [color:var(--chat-danger)] [font-family:var(--chat-mono)] m-0'

export const FILE_HEADER_CSS =
  '[data-diffs-header=default]{box-sizing:border-box;block-size:2rem;min-height:0;padding-inline:0.75rem 0.25rem;background-color:var(--chat-fill);border-block-end:1px solid var(--chat-line-soft);color:var(--chat-text-2);font-size:var(--chat-text-xs);font-family:var(--chat-mono)}[data-diffs-header]~[data-file] [data-code],[data-diffs-header]~[data-diff] [data-code]{padding-top:var(--diffs-gap-block,var(--diffs-gap-fallback))}'

export function codeBlockOptions(): FileOptions<undefined, undefined> {
  return {
    theme: codeTheme(),
    themeType: 'system',
    disableFileHeader: true,
    disableLineNumbers: true,
    overflow: 'wrap',
  }
}

export function codeLineOptions(): FileOptions<undefined, undefined> {
  return {...codeBlockOptions(), overflow: 'scroll'}
}

export function codeBlockFileChromeOptions(): FileOptions<undefined, undefined> {
  return {
    ...codeBlockOptions(),
    disableFileHeader: false,
    disableLineNumbers: false,
    unsafeCSS: FILE_HEADER_CSS,
  }
}

export function codeBlockTitledOptions(): FileOptions<undefined, undefined> {
  return {
    ...codeBlockOptions(),
    disableFileHeader: false,
    unsafeCSS: FILE_HEADER_CSS,
    renderCustomHeader: () => undefined,
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
  return status === 'running' || status === 'approval' ? 'running' : 'done'
}

export function cardTitle(
  meta: {label?: {running: string; done: string}; summary?: string} | undefined,
  phase: CardPhase,
  fallbackName: string,
): string {
  return meta?.label?.[phase] || meta?.summary || fallbackName
}
