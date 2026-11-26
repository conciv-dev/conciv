import {z} from 'zod'
import {TestLLM, type Engine} from '@conciv/backend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import type {CommentRow, PinRow} from '../../src/rows.js'

export type BoardComment = {
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

export type BoardCommentRows = {
  readonly comment: Omit<CommentRow, 'sessionId'>
  readonly pin: Omit<PinRow, 'room'> | undefined
}

export function boardComment(input: BoardComment): BoardCommentRows {
  const createdAt = input.createdAt ?? Date.now()
  const comment = {
    id: `${input.cid}-row`,
    cid: input.cid,
    threadId: input.parentCid ?? input.cid,
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
  } satisfies Omit<CommentRow, 'sessionId'>
  if (input.parentCid !== undefined) return {comment, pin: undefined}
  return {
    comment,
    pin: {
      id: `${input.cid}-pin`,
      cid: input.cid,
      x: input.x,
      y: input.y,
      elementId: null,
      pinState: 'locked',
      anchorX: null,
      anchorY: null,
    },
  }
}

export function boardCall(id: string, tool: string, input: object) {
  return TestLLM.toolCall(id, 'execute_typescript', {
    typescriptCode: `return await external_whiteboard_${tool}(${JSON.stringify(input)})`,
  })
}

export const WHITEBOARD = {plugins: ['@internal/plugin-whiteboard']}

const ChangeKey = z.object({key: z.string()})

type BoardTable = 'comments' | 'pins' | 'canvasElements'

export async function insertComment(engine: Engine, room: string, input: BoardComment): Promise<void> {
  const {comment, pin} = boardComment(input)
  await engine.rpc.call('whiteboard', 'comments.insert', {room, row: comment})
  if (pin !== undefined) await engine.rpc.call('whiteboard', 'pins.insert', {room, row: pin})
}

export function seedComments(engine: Engine, room: string, comments: readonly BoardComment[]): Promise<void> {
  return comments.reduce<Promise<void>>(
    (seeded, input) => seeded.then(() => insertComment(engine, room, input)),
    Promise.resolve(),
  )
}

function readRow(engine: Engine, room: string, table: BoardTable, key: string): Promise<unknown> {
  if (table === 'canvasElements')
    return engine.rpc.call('whiteboard', 'elements.get', {room, scope: 'live', elementId: key})
  return engine.rpc.call('whiteboard', `${table}.get`, {room, id: key})
}

export async function nextWrite(engine: Engine, room: string, table: BoardTable): Promise<{row: Promise<unknown>}> {
  const change = await engine.event('rpc.whiteboard.changed', {data: {room, table, type: 'upsert'}})
  return {row: change.arrived.then(({data}) => readRow(engine, room, table, ChangeKey.parse(data).key))}
}

export function showBoard(engine: Engine, room: string = engine.session.id): Promise<void> {
  return renderTestApp({engine, initialEntries: [`/panel/${room}?open=true`]})
}
