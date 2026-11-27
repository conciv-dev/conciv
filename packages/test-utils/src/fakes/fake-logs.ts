import type {LogLevel} from '@conciv/types/config-types'
import {channel} from './fake-channel.js'
import type {Call} from './fake-types.js'

type EventLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

type Levels = {engine: LogLevel; widget: LogLevel; dropped: number}

type ClientEvent = {
  readonly level: EventLevel
  readonly timestamp: string
  readonly service: string
  readonly fields: Readonly<Record<string, unknown>>
}

type LogEvent = {
  id: string
  timestamp: string
  level: string
  service: string
  environment: string
  message: string | null
  method: string | null
  path: string | null
  status: number | null
  durationMs: number | null
  requestId: string | null
  source: string | null
  sessionId: string | null
  error: string | null
  data: string | null
  createdAt: string
}

type Query = {
  since?: string | undefined
  until?: string | undefined
  level?: readonly EventLevel[] | undefined
  source?: 'engine' | 'client' | undefined
  text?: string | undefined
  sessionId?: string | undefined
  limit: number
}

function textField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function storedRow(event: ClientEvent): LogEvent {
  const {message, sessionId, error, ...data} = event.fields
  return {
    id: crypto.randomUUID(),
    timestamp: event.timestamp,
    level: event.level,
    service: event.service,
    environment: 'local',
    message: textField(message),
    method: null,
    path: null,
    status: null,
    durationMs: null,
    requestId: null,
    source: 'client',
    sessionId: textField(sessionId),
    error: error === undefined ? null : JSON.stringify(error),
    data: Object.keys(data).length > 0 ? JSON.stringify(data) : null,
    createdAt: new Date().toISOString(),
  }
}

function inRange(row: LogEvent, query: Omit<Query, 'limit'>): boolean {
  return (
    (query.since === undefined || row.timestamp >= query.since) &&
    (query.until === undefined || row.timestamp <= query.until)
  )
}

function ofLevel(row: LogEvent, levels: Query['level']): boolean {
  return levels === undefined || levels.length === 0 || levels.some((level) => level === row.level)
}

function ofOrigin(row: LogEvent, query: Omit<Query, 'limit'>): boolean {
  return (
    (query.source === undefined || row.source === query.source) &&
    (query.sessionId === undefined || row.sessionId === query.sessionId)
  )
}

function hasText(row: LogEvent, text: string | undefined): boolean {
  return text === undefined || [row.message, row.data].some((field) => field?.includes(text) === true)
}

function matches(row: LogEvent, query: Omit<Query, 'limit'>): boolean {
  return inRange(row, query) && ofLevel(row, query.level) && ofOrigin(row, query) && hasText(row, query.text)
}

const SEVERITY: readonly EventLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

function kept(level: LogLevel, event: ClientEvent): boolean {
  return level !== 'off' && SEVERITY.indexOf(event.level) >= SEVERITY.indexOf(level)
}

export function createLogs() {
  const levels: Levels = {engine: 'off', widget: 'off', dropped: 0}
  const changes = channel<Levels>()
  const inserted = channel<LogEvent>()
  const rows: LogEvent[] = []
  return {
    level: async function* (_input: unknown, call: Call) {
      yield {...levels}
      yield* changes.read(call.signal)
    },
    setLevel: (input: {level: LogLevel; scope: 'engine' | 'widget' | 'all'}) => {
      if (input.scope !== 'widget') levels.engine = input.level
      if (input.scope !== 'engine') levels.widget = input.level
      changes.push({...levels})
      return {...levels}
    },
    write: (input: {events: readonly ClientEvent[]}) => {
      const stored = input.events.filter((event) => kept(levels.widget, event)).map(storedRow)
      rows.push(...stored)
      stored.forEach((row) => inserted.push(row))
      return {ok: true as const}
    },
    query: (input: Query) => ({
      level: levels.engine,
      events:
        levels.engine === 'off' && levels.widget === 'off'
          ? []
          : rows
              .filter((row) => matches(row, input))
              .toSorted((left, right) => right.timestamp.localeCompare(left.timestamp))
              .slice(0, input.limit),
    }),
    tail: async function* (input: Omit<Query, 'limit' | 'since' | 'until' | 'text' | 'sessionId'>, call: Call) {
      for await (const row of inserted.read(call.signal)) if (matches(row, input)) yield row
    },
    cleanup: () => ({result: 'success' as const, deleted: 0}),
  }
}
