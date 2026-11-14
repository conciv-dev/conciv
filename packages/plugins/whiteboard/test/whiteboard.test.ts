import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {describe, expect, it, onTestFinished} from 'vitest'
import {z} from 'zod'
import {makeDiscoverTools, makeRpcClient} from '@conciv/harness-testkit'
import {readApprovalAsk} from '@conciv/protocol/chat-event-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const OTHER_ROOM = 'conciv_other_room'
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const OFFERED_TOOLS = [
  'whiteboard_anchor_resolve',
  'whiteboard_canvas_clear',
  'whiteboard_canvas_commit',
  'whiteboard_canvas_connect',
  'whiteboard_canvas_delete',
  'whiteboard_canvas_diagram',
  'whiteboard_canvas_discard',
  'whiteboard_canvas_draw',
  'whiteboard_canvas_export',
  'whiteboard_canvas_preview',
  'whiteboard_canvas_read',
  'whiteboard_canvas_svg',
  'whiteboard_canvas_update',
  'whiteboard_comment_create',
  'whiteboard_comment_delete',
  'whiteboard_comment_list',
  'whiteboard_comment_move',
  'whiteboard_comment_read',
  'whiteboard_comment_reply',
  'whiteboard_comment_resolve',
  'whiteboard_element_reference',
  'whiteboard_pin_set_state',
]

const PinSchema = z.object({
  id: z.string(),
  room: z.string(),
  cid: z.string(),
  x: z.number(),
  y: z.number(),
  elementId: z.string().nullable(),
  pinState: z.enum(['locked', 'offset']),
  anchorX: z.number().nullable(),
  anchorY: z.number().nullable(),
})
const CommentSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    cid: z.string(),
    threadId: z.string(),
    parentId: z.string().nullable(),
    kind: z.enum(['source-linked', 'floating']),
    anchorHash: z.string().nullable(),
  })
  .loose()
const ElementSchema = z.object({room: z.string(), elementId: z.string(), data: z.unknown(), version: z.number()})
const PendingSchema = z.object({
  id: z.string(),
  room: z.string(),
  kind: z.enum(['skeletons', 'mermaid', 'svg', 'export', 'commit', 'discard']),
  stage: z.enum(['draft', 'live']),
  payload: z.unknown(),
})
const ExportPayloadSchema = z.object({requestId: z.string()})
const ChangeSchema = z.strictObject({
  room: z.string(),
  table: z.string(),
  key: z.string(),
  type: z.enum(['upsert', 'delete']),
  cursor: z.number(),
})
const SinceSchema = z.object({
  changes: z.array(z.strictObject({table: z.string(), key: z.string(), type: z.string(), cursor: z.number()})),
  cursor: z.number(),
})
const RpcFailureSchema = z.object({code: z.literal('PLUGIN_RPC'), data: z.object({type: z.string()}).loose()})
const ConflictSchema = z.object({
  code: z.literal('PLUGIN_RPC'),
  data: z.object({type: z.literal('CONFLICT'), data: z.object({current: ElementSchema})}),
})

type Change = z.infer<typeof ChangeSchema>

async function boot(files?: Record<string, string>): Promise<{kit: CoreKit; room: string}> {
  const kit = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR], ...(files === undefined ? {} : {files})})
  onTestFinished(() => kit.cleanup())
  return {kit, room: await kit.session()}
}

function call(kit: CoreKit, method: string, input: unknown): Promise<unknown> {
  return kit.rpc.plugin.call({rpcId: 'whiteboard', method, input}, {signal: AbortSignal.timeout(30_000)})
}

async function failureType(pending: Promise<unknown>): Promise<string> {
  const failure = await pending.then(
    () => new Error('the call answered instead of failing'),
    (error: unknown) => error,
  )
  return RpcFailureSchema.parse(failure).data.type
}

async function rejection(pending: Promise<unknown>): Promise<Error> {
  const failure = await pending.then(
    () => new Error('the call answered instead of failing'),
    (error: unknown) => error,
  )
  if (!(failure instanceof Error) || failure.message === 'the call answered instead of failing')
    throw new Error(`expected the call to fail, got ${String(failure)}`)
  return failure
}

function renderedToModel(result: unknown) {
  return [
    {type: 'text', content: JSON.stringify({result, logs: []})},
    {type: 'image', source: {type: 'data', mimeType: 'image/png', value: expect.any(String)}},
  ]
}

type Settled = {value: unknown} | {error: unknown}

async function askedTool(
  kit: CoreKit,
  room: string,
  name: string,
  input: unknown,
  decision: {approved: boolean; scope: 'once' | 'session'},
): Promise<{toolName: string; settled: Settled}> {
  const events = await kit.events(room)
  const settled: Promise<Settled> = useTool(kit, name, input).then(
    (value) => ({value}),
    (error: unknown) => ({error}),
  )
  const asked = readApprovalAsk(await events.waitFor((event) => readApprovalAsk(event) !== null))
  if (asked === null) throw new Error(`${name} raised no permission ask`)
  const session = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: room}})
  await session.chat.permissionDecision({approvalId: asked.approvalId, ...decision})
  return {toolName: asked.toolName, settled: await settled}
}

function denial(name: string): string {
  return `The user denied running tool "${name}". Do not retry it; continue without it.`
}

function useTool(kit: CoreKit, name: string, input: unknown = {}): Promise<unknown> {
  return kit.callTool(`whiteboard_${name}`, input)
}

async function listElements(kit: CoreKit, room: string, scope: 'live' | 'draft') {
  return z.array(ElementSchema).parse(await call(kit, 'elements.list', {room, scope}))
}

async function listPending(kit: CoreKit, room: string) {
  return z.array(PendingSchema).parse(await call(kit, 'canvasPending.list', {room}))
}

async function since(kit: CoreKit, room: string, cursor: number) {
  return SinceSchema.parse(await call(kit, 'since', {room, cursor}))
}

async function followChanges(kit: CoreKit, onChange: (change: Change) => Promise<void> | void) {
  const closing = new AbortController()
  const stream = await kit.rpc.event.subscribe({types: ['rpc.whiteboard.changed']}, {signal: closing.signal})
  const connected = await stream.next()
  expect(connected).toMatchObject({done: false, value: {type: 'server.connected'}})
  const following = (async () => {
    for await (const delivered of stream) {
      expect(delivered.type).toBe('rpc.whiteboard.changed')
      await onChange(ChangeSchema.parse(delivered.data))
    }
  })().catch((error: unknown) => {
    if (!closing.signal.aborted) throw error
  })
  return async () => {
    closing.abort()
    await following
  }
}

async function changesUntil(
  kit: CoreKit,
  match: (change: Change) => boolean,
  count: number,
  start: () => Promise<unknown>,
): Promise<Change[]> {
  const matched: Change[] = []
  const seen = Promise.withResolvers<Change[]>()
  const stop = await followChanges(kit, (change) => {
    if (!match(change)) return
    matched.push(change)
    if (matched.length === count) seen.resolve(matched)
  })
  try {
    await start()
    return await seen.promise
  } finally {
    await stop()
  }
}

async function performPending(kit: CoreKit, room: string, pending: z.infer<typeof PendingSchema>): Promise<void> {
  if (pending.kind === 'commit') {
    const drafts = await listElements(kit, room, 'draft')
    await call(kit, 'elements.bulkUpsert', {room, scope: 'live', rows: drafts.map(({room: _room, ...row}) => row)})
    await call(kit, 'elements.bulkDelete', {room, scope: 'draft', elementIds: drafts.map((row) => row.elementId)})
  }
  if (pending.kind === 'export') {
    const {requestId} = ExportPayloadSchema.parse(pending.payload)
    await call(kit, 'canvasReplies.insert', {
      room,
      row: {id: randomUUID(), requestId, kind: 'export', payload: {dataBase64: PNG_BASE64}},
    })
  }
  if (pending.stage === 'draft') {
    await call(kit, 'elements.bulkUpsert', {
      room,
      scope: 'draft',
      rows: [
        {elementId: `drawn-${pending.id}`, data: {type: 'rectangle', x: 10, y: 10, width: 40, height: 20}, version: 1},
      ],
    })
  }
  await call(kit, 'canvasPending.remove', {room, id: pending.id})
}

function openCanvas(kit: CoreKit, room: string): Promise<() => Promise<void>> {
  return followChanges(kit, async (change) => {
    if (change.room !== room || change.table !== 'canvasPending' || change.type !== 'upsert') return
    const pending = (await listPending(kit, room)).find((row) => row.id === change.key)
    if (pending) await performPending(kit, room, pending)
  })
}

function commentRow(cid: string) {
  return {
    id: randomUUID(),
    cid,
    threadId: cid,
    parentId: null,
    parts: [{type: 'text', text: 'hi'}],
    authorKind: 'human',
    authorModel: null,
    authorId: null,
    authorName: null,
    authorAvatar: null,
    status: 'open',
    kind: 'floating',
    anchor: null,
    anchorFile: null,
    anchorComponent: null,
    anchorHash: null,
    createdAt: 1000,
    updatedAt: 1000,
    resolvedAt: null,
  }
}

async function board(kit: CoreKit, room: string) {
  return {
    comments: await call(kit, 'comments.list', {room}),
    pins: await call(kit, 'pins.list', {room}),
    elements: await listElements(kit, room, 'live'),
  }
}

function pinRow(cid: string) {
  return {id: randomUUID(), cid, x: 1, y: 2, elementId: null, pinState: 'locked', anchorX: null, anchorY: null}
}

describe('the whiteboard plugin', () => {
  it('is active and offers its twenty-two tools under the whiteboard namespace', async () => {
    const {kit, room} = await boot()

    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'whiteboard')
    expect(plugin?.state).toEqual({status: 'active'})
    expect(plugin?.features).toMatchObject({server: true, rpc: true})

    const discover = makeDiscoverTools(kit.base, room)
    const offered = await discover(OFFERED_TOOLS)
    expect(offered.errors).toBeUndefined()
    expect(offered.tools.map((tool) => tool.name).toSorted()).toEqual(OFFERED_TOOLS.map((name) => `external_${name}`))
    for (const tool of offered.tools) expect(tool.description, tool.name).not.toBe('')
  })
})

describe('the whiteboard store and its rpc', () => {
  it('keeps rows per room named by the input, refuses foreign or empty updates and gates element versions', async () => {
    const {kit, room} = await boot()

    const pin = {...pinRow('c1'), room}
    const {room: _pinRoom, ...pinInsert} = pin
    expect(PinSchema.parse(await call(kit, 'pins.insert', {room, row: pinInsert}))).toEqual(pin)
    expect(await call(kit, 'pins.list', {room})).toEqual([pin])
    expect(await call(kit, 'pins.list', {room: OTHER_ROOM})).toEqual([])
    expect(PinSchema.parse(await call(kit, 'pins.update', {room, id: pin.id, patch: {x: 9}})).x).toBe(9)
    expect(await failureType(call(kit, 'pins.update', {room: OTHER_ROOM, id: pin.id, patch: {x: 999}}))).toBe(
      'NOT_FOUND',
    )
    expect(await failureType(call(kit, 'pins.update', {room, id: pin.id, patch: {}}))).toBe('rpc.invalid_input')
    await call(kit, 'pins.update', {room, id: pin.id, patch: {x: 42, room: OTHER_ROOM, id: 'rewritten-id'}})
    expect(await call(kit, 'pins.list', {room})).toEqual([{...pin, x: 42}])
    expect(await call(kit, 'pins.list', {room: OTHER_ROOM})).toEqual([])
    expect(await call(kit, 'pins.remove', {room: OTHER_ROOM, id: pin.id})).toEqual({deleted: false})
    expect(await call(kit, 'pins.remove', {room, id: pin.id})).toEqual({deleted: true})
    expect(await failureType(call(kit, 'pins.insert', {room, row: {id: 'x'}}))).toBe('rpc.invalid_input')

    await call(kit, 'comments.insert', {
      room,
      row: commentRow('cc1'),
    })
    expect(
      z
        .array(CommentSchema)
        .parse(await call(kit, 'comments.list', {room}))
        .map((row) => row.cid),
    ).toEqual(['cc1'])
    expect(await call(kit, 'comments.list', {room: OTHER_ROOM})).toEqual([])

    const element = {elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    expect(await call(kit, 'elements.upsert', {room, scope: 'live', row: element})).toEqual({...element, room})
    const conflict = await call(kit, 'elements.upsert', {room, scope: 'live', row: {...element, version: 1}}).then(
      () => new Error('the stale upsert answered'),
      (error: unknown) => error,
    )
    expect(ConflictSchema.parse(conflict).data.data.current.version).toBe(2)
    const {rows} = z.object({rows: z.array(ElementSchema)}).parse(
      await call(kit, 'elements.bulkUpsert', {
        room,
        scope: 'live',
        rows: [
          {elementId: 'e1', data: {v: 'stale'}, version: 1},
          {elementId: 'e2', data: {v: 9}, version: 1},
        ],
      }),
    )
    expect(rows).toEqual([
      {...element, room},
      {room, elementId: 'e2', data: {v: 9}, version: 1},
    ])
    expect(await listElements(kit, OTHER_ROOM, 'live')).toEqual([])
    expect(await call(kit, 'elements.bulkDelete', {room, scope: 'live', elementIds: ['e1', 'e2', 'missing']})).toEqual({
      deleted: 2,
    })
    expect(await listElements(kit, room, 'live')).toEqual([])
  })

  it('keeps its database in the project folder, where a second engine on that folder reads the board back', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'conciv-whiteboard-reopen-'))
    onTestFinished(() => rmSync(folder, {recursive: true, force: true, maxRetries: 10, retryDelay: 50}))

    const first = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR], stateRoot: folder})
    const room = await first.session()
    const pin = {...pinRow('kept'), room}
    const {room: _pinRoom, ...pinInsert} = pin
    const element = {elementId: 'kept', data: {type: 'rectangle'}, version: 1}
    const fill = async () => {
      await call(first, 'comments.insert', {room, row: commentRow('kept')})
      await call(first, 'pins.insert', {room, row: pinInsert})
      await call(first, 'elements.upsert', {room, scope: 'live', row: element})
      return board(first, room)
    }
    const stored = await fill().finally(() => first.cleanup())
    expect(
      z
        .array(CommentSchema)
        .parse(stored.comments)
        .map((row) => row.cid),
    ).toEqual(['kept'])
    expect(stored.pins).toEqual([pin])
    expect(stored.elements).toEqual([{...element, room}])

    const second = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR], stateRoot: folder})
    onTestFinished(() => second.cleanup())
    expect(second.stateRoot).toBe(folder)
    expect(await board(second, room)).toEqual(stored)
    expect(existsSync(join(folder, '.conciv', 'whiteboard', 'whiteboard.db'))).toBe(true)
  })

  it('announces each stored change as ids and a per-room cursor, and answers the missed changes since a cursor', async () => {
    const {kit, room} = await boot()
    const seen: Change[] = []
    const settled = Promise.withResolvers<void>()
    const stop = await followChanges(kit, (change) => {
      seen.push(change)
      if (seen.length === 4) settled.resolve()
    })

    const pin = pinRow('c1')
    await call(kit, 'pins.insert', {room, row: pin})
    await call(kit, 'elements.upsert', {room, scope: 'live', row: {elementId: 'e1', data: {}, version: 2}})
    await failureType(call(kit, 'elements.upsert', {room, scope: 'live', row: {elementId: 'e1', data: {}, version: 1}}))
    await call(kit, 'pins.remove', {room, id: pin.id})
    await call(kit, 'pins.insert', {room: OTHER_ROOM, row: pinRow('elsewhere')})
    await settled.promise
    await stop()

    const expected = [
      {room, table: 'pins', key: pin.id, type: 'upsert', cursor: 1},
      {room, table: 'canvasElements', key: 'e1', type: 'upsert', cursor: 2},
      {room, table: 'pins', key: pin.id, type: 'delete', cursor: 3},
    ]
    expect(seen.filter((change) => change.room === room)).toEqual(expected)
    expect(seen.filter((change) => change.room === OTHER_ROOM).map((change) => change.cursor)).toEqual([1])

    const everything = await since(kit, room, 0)
    expect(everything).toEqual({changes: expected.map(({room: _room, ...change}) => change), cursor: 3})
    expect((await since(kit, room, 1)).changes.map((change) => change.cursor)).toEqual([2, 3])
    expect(await since(kit, room, 3)).toEqual({changes: [], cursor: 3})
    expect((await since(kit, OTHER_ROOM, 0)).cursor).toBe(1)
  })
})

describe('the whiteboard canvas tools', () => {
  it('draws into the draft through an open canvas, previews, exports, commits and discards', async () => {
    const {kit, room} = await boot()
    const closeCanvas = await openCanvas(kit, room)

    expect(await useTool(kit, 'canvas_read', {scope: 'draft'})).toEqual({elements: [], scope: 'draft'})
    expect(await useTool(kit, 'canvas_preview')).toEqual({empty: true, reason: 'draft has no elements yet'})

    await rejection(useTool(kit, 'canvas_svg', {svg: '<script/>', x: 0, y: 0}))
    await rejection(useTool(kit, 'canvas_diagram', {mermaid: 'graph TD\n' + 'a-->b\n'.repeat(501)}))
    expect(await listPending(kit, room)).toEqual([])

    expect(
      z
        .object({pending: z.string()})
        .parse(await useTool(kit, 'canvas_draw', {elements: [{type: 'rectangle', x: 0, y: 0}]})),
    ).toBeTruthy()
    const drawn = await listElements(kit, room, 'draft')
    expect(drawn).toHaveLength(1)
    expect(await listElements(kit, room, 'live')).toEqual([])
    const [first] = drawn
    if (first === undefined) throw new Error('the draw left no draft element')

    expect(await useTool(kit, 'canvas_update', {elementId: first.elementId, patch: {width: 99}})).toEqual({
      updated: true,
    })
    expect(await useTool(kit, 'canvas_update', {elementId: 'missing', patch: {width: 1}})).toEqual({updated: false})
    expect(await listElements(kit, room, 'draft')).toEqual([
      {...first, data: {...z.record(z.string(), z.unknown()).parse(first.data), width: 99}, version: 2},
    ])

    expect(await useTool(kit, 'canvas_preview')).toEqual(renderedToModel({elements: 1}))
    expect(await useTool(kit, 'canvas_export', {format: 'png', scope: 'draft'})).toEqual(
      renderedToModel({scope: 'draft'}),
    )
    expect(await listPending(kit, room)).toEqual([])

    expect(await useTool(kit, 'canvas_commit')).toEqual({committed: true, elements: 1})
    expect(await listElements(kit, room, 'draft')).toEqual([])
    expect((await listElements(kit, room, 'live')).map((row) => row.elementId)).toEqual([first.elementId])
    expect(await useTool(kit, 'canvas_commit')).toEqual({committed: false, reason: 'no draft to commit'})
    expect(await useTool(kit, 'canvas_export', {format: 'json', scope: 'live'})).toEqual({
      elements: [{...z.record(z.string(), z.unknown()).parse(first.data), width: 99}],
    })

    expect(
      z
        .object({pending: z.string()})
        .parse(await useTool(kit, 'canvas_svg', {svg: "<svg><rect width='4' height='4'/></svg>", x: 0, y: 0})),
    ).toBeTruthy()
    expect(
      z.object({pending: z.string()}).parse(await useTool(kit, 'canvas_connect', {fromId: 'a', toId: 'b'})),
    ).toBeTruthy()
    expect(await useTool(kit, 'canvas_discard')).toEqual({discarded: 2})
    expect(await listElements(kit, room, 'draft')).toEqual([])

    await closeCanvas()
    await rejection(useTool(kit, 'canvas_draw', {elements: [{type: 'ellipse', x: 0, y: 0}]}))
    expect(await listPending(kit, room)).toEqual([])
  })

  it('commits an abandoned draft when a turn finishes', async () => {
    const {kit, room} = await boot()
    await call(kit, 'elements.upsert', {room, scope: 'draft', row: {elementId: 'd1', data: {}, version: 1}})

    const [committed] = await changesUntil(
      kit,
      (change) => change.room === room && change.table === 'canvasPending' && change.type === 'upsert',
      1,
      async () => (await kit.chat('draw something')).done(),
    )
    if (committed === undefined) throw new Error('the finished turn announced no pending commit')
    expect(await listPending(kit, room)).toEqual([
      {id: committed.key, room, kind: 'commit', stage: 'live', payload: {}},
    ])
  })
})

describe('the whiteboard comment tools', () => {
  it('creates, replies to, reads, lists and moves comments, sets pin state, and asks before deleting, clearing, resolving or removing', async () => {
    const {kit, room} = await boot()
    expect(
      await useTool(kit, 'comment_create', {
        cid: 'root',
        kind: 'floating',
        parts: [{type: 'text', text: 'look here'}],
        x: 5,
        y: 6,
        authorKind: 'ai',
      }),
    ).toEqual({cid: 'root'})
    expect(
      z
        .array(PinSchema)
        .parse(await call(kit, 'pins.list', {room}))
        .map(({cid, x, y}) => ({cid, x, y})),
    ).toEqual([{cid: 'root', x: 5, y: 6}])

    const reply = z
      .object({cid: z.string()})
      .parse(await useTool(kit, 'comment_reply', {cid: 'root', parts: [{type: 'text', text: 'agreed'}]}))
    const read = z
      .object({comment: CommentSchema, replies: z.array(CommentSchema)})
      .parse(await useTool(kit, 'comment_read', {cid: 'root'}))
    expect(read.comment.cid).toBe('root')
    expect(read.replies.map((row) => ({cid: row.cid, threadId: row.threadId}))).toEqual([
      {cid: reply.cid, threadId: 'root'},
    ])
    expect(
      z
        .object({comments: z.array(CommentSchema)})
        .parse(await useTool(kit, 'comment_list', {scope: 'session'}))
        .comments.map((row) => row.cid),
    ).toEqual(['root'])

    expect(await useTool(kit, 'comment_move', {cid: 'root', x: 50, y: 60})).toEqual({cid: 'root', x: 50, y: 60})
    expect(await useTool(kit, 'pin_set_state', {cid: 'root', pinState: 'offset'})).toEqual({
      cid: 'root',
      pinState: 'offset',
    })
    expect(
      z
        .array(PinSchema)
        .parse(await call(kit, 'pins.list', {room}))
        .map(({x, y, pinState}) => ({x, y, pinState})),
    ).toEqual([{x: 50, y: 60, pinState: 'offset'}])

    await rejection(useTool(kit, 'comment_read', {cid: 'nonexistent'}))
    await rejection(useTool(kit, 'pin_set_state', {cid: 'nonexistent', pinState: 'locked'}))

    await call(kit, 'elements.bulkUpsert', {
      room,
      scope: 'live',
      rows: ['e1', 'e2', 'e3'].map((elementId) => ({elementId, data: {type: 'rectangle'}, version: 1})),
    })
    const denied = await askedTool(kit, room, 'canvas_delete', {elementId: 'e1'}, {approved: false, scope: 'once'})
    expect(denied.toolName).toContain('whiteboard_canvas_delete')
    expect(denied.settled).toEqual({
      error: expect.objectContaining({
        message: JSON.stringify({error: {message: denial('whiteboard_canvas_delete'), name: 'Error'}}),
      }),
    })
    expect((await listElements(kit, room, 'live')).map((row) => row.elementId)).toEqual(['e1', 'e2', 'e3'])

    const always = await askedTool(kit, room, 'canvas_delete', {elementId: 'e1'}, {approved: true, scope: 'session'})
    expect(always.settled).toEqual({value: {deleted: 'e1'}})
    expect(await useTool(kit, 'canvas_delete', {elementId: 'e2'})).toEqual({deleted: 'e2'})

    const cleared = await askedTool(kit, room, 'canvas_clear', {}, {approved: true, scope: 'once'})
    expect(cleared.toolName).toContain('whiteboard_canvas_clear')
    expect(cleared.settled).toEqual({value: {cleared: 1}})
    expect(await listElements(kit, room, 'live')).toEqual([])

    const resolved = await askedTool(kit, room, 'comment_resolve', {cid: 'root'}, {approved: true, scope: 'once'})
    expect(resolved.toolName).toContain('whiteboard_comment_resolve')
    expect(resolved.settled).toEqual({value: {cid: 'root', status: 'resolved'}})

    const removed = await askedTool(kit, room, 'comment_delete', {cid: 'root'}, {approved: true, scope: 'once'})
    expect(removed.toolName).toContain('whiteboard_comment_delete')
    expect(removed.settled).toEqual({value: {cid: 'root', deleted: true}})
    expect(await call(kit, 'comments.list', {room})).toEqual([])
    expect(await call(kit, 'pins.list', {room})).toEqual([])
  })

  it('raises each failure to the caller with its message', async () => {
    const {kit, room} = await boot()
    await expect(useTool(kit, 'comment_read', {cid: 'nonexistent'})).rejects.toThrow('comment nonexistent not found')
    await expect(useTool(kit, 'comment_move', {cid: 'nonexistent', x: 0, y: 0})).rejects.toThrow(
      'no pin for comment nonexistent',
    )
    await expect(useTool(kit, 'canvas_svg', {svg: '<svg><script/></svg>', x: 0, y: 0})).rejects.toThrow(
      'script elements are not allowed',
    )
    await expect(useTool(kit, 'canvas_diagram', {mermaid: 'graph TD\n' + 'a-->b\n'.repeat(501)})).rejects.toThrow(
      'diagram exceeds 500 edges',
    )
    await expect(useTool(kit, 'canvas_draw', {elements: []})).rejects.toThrow('no canvas is open to draw into')
    await expect(useTool(kit, 'canvas_export', {format: 'png'})).rejects.toThrow('export timed out')
    await call(kit, 'elements.upsert', {room, scope: 'draft', row: {elementId: 'stuck', data: {}, version: 1}})
    await expect(useTool(kit, 'canvas_commit')).rejects.toThrow('commit timed out')
  })
})

describe('the whiteboard anchors', () => {
  const APP = [
    'export function App() {',
    '  return (',
    '    <main>',
    '      <Card title="hello" />',
    '    </main>',
    '  )',
    '}',
    '',
  ].join('\n')

  it('locates a component, anchors a comment to it, follows it when it moves, loses it when it changes, and enriches an inserted comment', async () => {
    const {kit, room} = await boot({'src/App.tsx': APP})

    const located = z
      .object({found: z.literal(true), file: z.string(), line: z.number(), column: z.number()})
      .parse(await useTool(kit, 'element_reference', {file: 'src/App.tsx', component: 'Card'}))
    expect(located).toMatchObject({file: 'src/App.tsx', line: 4})
    expect(await useTool(kit, 'element_reference', {file: 'src/App.tsx', component: 'Missing'})).toEqual({found: false})

    await useTool(kit, 'comment_create', {
      cid: 'anchored',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'this card'}],
      anchor: {source: {file: 'src/App.tsx', line: located.line, column: located.column}},
      x: 0,
      y: 0,
      authorKind: 'human',
    })
    const [anchored] = z.array(CommentSchema).parse(await call(kit, 'comments.list', {room}))
    expect(anchored?.anchorHash).toEqual(expect.any(String))
    expect(await useTool(kit, 'anchor_resolve', {cid: 'anchored'})).toMatchObject({status: 'fresh'})

    kit.writeProjectFile('src/App.tsx', `// moved down\n\n${APP}`)
    expect(await useTool(kit, 'anchor_resolve', {cid: 'anchored'})).toMatchObject({status: 'moved'})
    kit.writeProjectFile('src/App.tsx', APP.replace('<Card title="hello" />', '<Panel title="hello" />'))
    expect(await useTool(kit, 'anchor_resolve', {cid: 'anchored'})).toMatchObject({status: 'orphaned'})
    kit.writeProjectFile('src/App.tsx', APP)

    const inserted = randomUUID()
    const insertedThenEnriched = await changesUntil(
      kit,
      (change) => change.key === inserted && change.table === 'comments',
      2,
      () =>
        call(kit, 'comments.insert', {
          room,
          row: {
            id: inserted,
            cid: 'picked',
            threadId: 'picked',
            parentId: null,
            parts: [],
            authorKind: 'human',
            authorModel: null,
            authorId: null,
            authorName: null,
            authorAvatar: null,
            status: 'open',
            kind: 'source-linked',
            anchor: {source: {file: 'src/App.tsx', line: located.line, column: located.column}},
            anchorFile: null,
            anchorComponent: null,
            anchorHash: null,
            createdAt: 1,
            updatedAt: 1,
            resolvedAt: null,
          },
        }),
    )
    expect(insertedThenEnriched.map((change) => change.type)).toEqual(['upsert', 'upsert'])
    const rows = z.array(CommentSchema).parse(await call(kit, 'comments.list', {room}))
    expect(rows.find((row) => row.id === inserted)?.anchorHash).toEqual(anchored?.anchorHash)
  })
})
