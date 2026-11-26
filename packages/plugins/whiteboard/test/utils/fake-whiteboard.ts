import type {FakePluginCall, FakePluginHandler} from '@conciv/client/testing'
import {Whiteboard} from '../../src/rpc.js'
import type {CommentRow, PinRow} from '../../src/rows.js'

type Table =
  | 'comments'
  | 'pins'
  | 'reads'
  | 'canvasPending'
  | 'canvasReplies'
  | 'canvasElements'
  | 'canvasDraftElements'

type Row = Record<string, unknown>

type Change = {table: Table; key: string; type: 'upsert' | 'delete'; cursor: number}

export type FakeWhiteboard = {
  readonly handlers: Readonly<Record<string, FakePluginHandler>>
  readonly rows: (table: Table, room: string) => readonly Row[]
  readonly written: (table: Table) => Promise<Row>
  readonly comment: (room: string, comment: AgentComment) => void
  readonly update: (table: Table, room: string, key: string, patch: Row) => void
}

export type AgentComment = {
  readonly cid: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly authorKind?: 'ai' | 'human'
  readonly authorModel?: string
  readonly source?: {readonly file: string; readonly line: number}
  readonly parentCid?: string
  readonly createdAt?: number
}

const ROW_TABLES: Readonly<Record<string, {table: Table; key: string; roomKey: string}>> = {
  comments: {table: 'comments', key: 'id', roomKey: 'sessionId'},
  pins: {table: 'pins', key: 'id', roomKey: 'room'},
  reads: {table: 'reads', key: 'id', roomKey: 'sessionId'},
  canvasPending: {table: 'canvasPending', key: 'id', roomKey: 'room'},
  canvasReplies: {table: 'canvasReplies', key: 'id', roomKey: 'room'},
}

function readField(input: unknown, key: string): unknown {
  return typeof input === 'object' && input !== null ? Reflect.get(input, key) : undefined
}

function readText(input: unknown, key: string): string {
  const value = readField(input, key)
  return typeof value === 'string' ? value : ''
}

function readRow(input: unknown, key: string): Row {
  const value = readField(input, key)
  return typeof value === 'object' && value !== null ? {...value} : {}
}

function readRows(input: unknown): Row[] {
  const value = readField(input, 'rows')
  return Array.isArray(value)
    ? value.map((row: unknown) => (typeof row === 'object' && row !== null ? {...row} : {}))
    : []
}

function readIds(input: unknown): string[] {
  const value = readField(input, 'elementIds')
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

function elementTable(input: unknown): Table {
  return readText(input, 'scope') === 'draft' ? 'canvasDraftElements' : 'canvasElements'
}

export function createFakeWhiteboard(): FakeWhiteboard {
  const tables = new Map<string, Row>()
  const changes: Change[] = []
  const waiting: {table: Table; resolve: (row: Row) => void}[] = []
  const emitters: FakePluginCall[] = []
  const location = (table: Table, room: string, key: string) => `${table}\n${room}\n${key}`
  const list = (table: Table, room: string): Row[] =>
    [...tables.entries()].flatMap(([at, row]) => (at.startsWith(`${table}\n${room}\n`) ? [row] : []))
  const announce = (table: Table, room: string, key: string, type: Change['type'], row: Row): void => {
    const change = {table, key, type, cursor: changes.length + 1}
    changes.push({...change})
    emitters.forEach((call) => call.emit('rpc.whiteboard.changed', {room, ...change}))
    const due = waiting.filter((entry) => entry.table === table)
    due.forEach((entry) => {
      waiting.splice(waiting.indexOf(entry), 1)
      entry.resolve(row)
    })
  }
  const put = (table: Table, room: string, key: string, row: Row): Row => {
    tables.set(location(table, room, key), row)
    announce(table, room, key, 'upsert', row)
    return row
  }
  const drop = (table: Table, room: string, key: string): boolean => {
    const at = location(table, room, key)
    const row = tables.get(at)
    if (row === undefined) return false
    tables.delete(at)
    announce(table, room, key, 'delete', row)
    return true
  }
  const found = (table: Table, room: string, key: string): Row => {
    const row = tables.get(location(table, room, key))
    if (row === undefined) throw new Error(`no ${table} row ${key} in this room`)
    return row
  }
  const remember = (call: FakePluginCall): void => {
    if (!emitters.includes(call)) emitters.push(call)
  }
  const seen =
    (handler: (input: unknown) => unknown): FakePluginHandler =>
    (input, call) => {
      remember(call)
      return handler(input)
    }
  const rowHandlers = Object.entries(ROW_TABLES).flatMap(([name, spec]): [string, FakePluginHandler][] => [
    [`${name}.list`, seen((input) => list(spec.table, readText(input, 'room')))],
    [`${name}.get`, seen((input) => found(spec.table, readText(input, 'room'), readText(input, 'id')))],
    [
      `${name}.insert`,
      seen((input) => {
        const room = readText(input, 'room')
        const row = {...readRow(input, 'row'), [spec.roomKey]: room}
        return put(spec.table, room, readText(row, spec.key), row)
      }),
    ],
    [
      `${name}.update`,
      seen((input) => {
        const room = readText(input, 'room')
        const id = readText(input, 'id')
        return put(spec.table, room, id, {...found(spec.table, room, id), ...readRow(input, 'patch')})
      }),
    ],
    [`${name}.remove`, seen((input) => ({deleted: drop(spec.table, readText(input, 'room'), readText(input, 'id'))}))],
  ])
  const handlers: Record<string, FakePluginHandler> = {
    ...Object.fromEntries(rowHandlers),
    'canvasPending.claim': seen((input) => ({
      claimed: drop('canvasPending', readText(input, 'room'), readText(input, 'id')),
    })),
    'elements.list': seen((input) => list(elementTable(input), readText(input, 'room'))),
    'elements.get': seen((input) => found(elementTable(input), readText(input, 'room'), readText(input, 'elementId'))),
    'elements.upsert': seen((input) => {
      const room = readText(input, 'room')
      const row = {...readRow(input, 'row'), room}
      return put(elementTable(input), room, readText(row, 'elementId'), row)
    }),
    'elements.bulkUpsert': seen((input) => {
      const room = readText(input, 'room')
      return {
        rows: readRows(input).map((row) => put(elementTable(input), room, readText(row, 'elementId'), {...row, room})),
      }
    }),
    'elements.bulkDelete': seen((input) => {
      const room = readText(input, 'room')
      return {deleted: readIds(input).filter((id) => drop(elementTable(input), room, id)).length}
    }),
    'cursor.move': seen(() => ({ok: true})),
    since: seen((input) => {
      const cursor = Number(readField(input, 'cursor'))
      return {changes: changes.filter((change) => change.cursor > cursor), cursor: changes.length}
    }),
  }
  const missing = Object.keys(Whiteboard.methods).filter((method) => handlers[method] === undefined)
  if (missing.length > 0) throw new Error(`the fake whiteboard does not answer ${missing.join(', ')}`)
  const comment: FakeWhiteboard['comment'] = (room, input) => {
    const createdAt = input.createdAt ?? Date.now()
    const thread = input.parentCid ?? input.cid
    const row: CommentRow = {
      id: `${input.cid}-row`,
      sessionId: room,
      cid: input.cid,
      threadId: thread,
      parentId: input.parentCid ?? null,
      parts: [{type: 'text', text: input.text}],
      authorKind: input.authorKind ?? 'ai',
      authorModel: input.authorModel ?? null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: input.source === undefined ? 'floating' : 'source-linked',
      anchor: input.source === undefined ? null : {source: {...input.source}},
      anchorFile: input.source?.file ?? null,
      anchorComponent: null,
      anchorHash: null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null,
    }
    put('comments', room, row.id, row)
    if (input.parentCid !== undefined) return
    const pin: PinRow = {
      id: `${input.cid}-pin`,
      room,
      cid: input.cid,
      x: input.x,
      y: input.y,
      elementId: null,
      pinState: 'locked',
      anchorX: null,
      anchorY: null,
    }
    put('pins', room, pin.id, pin)
  }
  return {
    handlers,
    rows: (table, room) => list(table, room),
    written: (table) => new Promise((resolve) => waiting.push({table, resolve})),
    comment,
    update: (table, room, key, patch) => void put(table, room, key, {...found(table, room, key), ...patch}),
  }
}
