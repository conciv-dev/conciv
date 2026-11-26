import {inspect} from 'node:util'
import type {LogEntry} from '@conciv/backend/start'

const shownLevels: readonly LogEntry['level'][] = ['warn', 'error', 'fatal']

function formatDetail(value: unknown): string {
  return typeof value === 'string' ? value : inspect(value)
}

function isLoginBanner(entry: LogEntry): boolean {
  return entry.level === 'info' && entry.attributes?.code !== undefined
}

function readErrors(entry: LogEntry): readonly unknown[] {
  const errors = Object.values(entry.attributes ?? {}).filter((value) => value instanceof Error)
  return entry.cause === undefined ? errors : [...errors, entry.cause]
}

export function readEngineLine(entry: LogEntry): string | undefined {
  if (isLoginBanner(entry)) return entry.message
  if (!shownLevels.includes(entry.level)) return undefined
  return [entry.message, ...readErrors(entry).map(formatDetail)].join(' ')
}
