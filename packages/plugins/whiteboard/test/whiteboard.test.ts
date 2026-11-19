import {execFileSync} from 'node:child_process'
import {mkdirSync} from 'node:fs'
import {open} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {describe, expect, it, onTestFinished, vi} from 'vitest'
import {isEqual, mapValues} from 'es-toolkit'
import {z} from 'zod'
import {makeDiscoverTools, makeRpcClient} from '@conciv/harness-testkit'
import {readApprovalAsk} from '@conciv/protocol/chat-event-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import type {Context as PluginContext} from '@conciv/plugin/effect/plugin'
import {Tool} from '@conciv/plugin/schema/tool'
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  PubSub,
  Ref,
  Scope,
  Stream,
  SubscriptionRef,
  type Schema,
} from 'effect'
import {TestClock} from 'effect/testing'
import {makeChangeFeed, SinceFailed, EventsStopped, type ChangeMessage, type FeedEvent} from '../src/change-feed.js'
import {startChangeFeed, transitionChangeFeed, type FeedChange} from '../src/change-feed-machine.js'
import {startDrain, transitionDrain, type DrainState} from '../src/drain-machine.js'
import {makePendingDrain, makeSceneVersions, RemoveFailed} from '../src/island-model.js'
import {replayDraft} from '../src/replay.js'
import type {PendingRow} from '../src/rows.js'
import {startPending, transitionPending, type PendingState} from '../src/pending-machine.js'
import {makeWhiteboardStore} from '../src/store.js'
import {awaitDrawing, commitDraft, exportPng} from '../src/canvas-tools.js'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const OTHER_ROOM = 'conciv_other_room'
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

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

const OFFERED_TOOLS = [
  'anchor_resolve canvas_clear canvas_commit canvas_connect canvas_delete canvas_diagram canvas_discard canvas_draw',
  'canvas_export canvas_preview canvas_read canvas_svg canvas_update comment_create comment_delete comment_list',
  'comment_move comment_read comment_reply comment_resolve element_reference pin_set_state',
]
  .flatMap((line) => line.split(' '))
  .map((name) => `whiteboard_${name}`)

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

async function boot(
  files?: Record<string, string>,
  options?: {agentCursorMs: number},
): Promise<{kit: CoreKit; room: string}> {
  const kit = await bootCoreKit({
    id: 'fake',
    plugins: [options === undefined ? PACKAGE_DIR : [PACKAGE_DIR, options]],
    ...(files === undefined ? {} : {files}),
  })
  onTestFinished(() => kit.cleanup())
  return {kit, room: await kit.session()}
}

function call(kit: CoreKit, method: string, input: unknown): Promise<unknown> {
  return kit.rpc.plugin.call({rpcId: 'whiteboard', method, input}, {signal: AbortSignal.timeout(30_000)})
}

async function failureType(pending: Promise<unknown>): Promise<string> {
  return RpcFailureSchema.parse(await rejection(pending)).data.type
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

async function nextCursor(cursors: AsyncIterator<{type: string}>): Promise<unknown> {
  for (;;) {
    const delivered = await cursors.next()
    if (delivered.done) throw new Error('the cursor events ended')
    if (delivered.value.type !== 'server.heartbeat') return delivered.value
  }
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
  const follow = async () => {
    for await (const delivered of stream) {
      if (delivered.type === 'server.heartbeat') continue
      expect(delivered.type).toBe('rpc.whiteboard.changed')
      await onChange(ChangeSchema.parse(delivered.data))
    }
  }
  const following = follow().catch((error: unknown) => {
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

const PreviewSchema = z.tuple([z.unknown(), z.object({source: z.object({value: z.string()})})])

async function previewColours(kit: CoreKit, room: string, colours: {fill: string; line: string; text: string}) {
  const rows = [
    {elementId: 'box', data: {type: 'rectangle', x: 0, y: 0, width: 20, height: 20, backgroundColor: colours.fill}},
    {
      elementId: 'line',
      data: {
        type: 'line',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [20, 20],
        ],
        strokeColor: colours.line,
      },
    },
    {elementId: 'label', data: {type: 'text', x: 0, y: 30, text: 'hi', strokeColor: colours.text}},
  ]
  await call(kit, 'elements.bulkUpsert', {room, scope: 'draft', rows: rows.map((row) => ({...row, version: 1}))})
  const [, image] = PreviewSchema.parse(await useTool(kit, 'canvas_preview'))
  await call(kit, 'elements.bulkDelete', {room, scope: 'draft', elementIds: rows.map((row) => row.elementId)})
  return image.source.value
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
  it('is active, serves its browser bundle, offers its twenty-two tools under the whiteboard namespace', async () => {
    const {kit, room} = await boot()

    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'whiteboard')
    expect(plugin?.state).toEqual({status: 'active'})
    expect(plugin?.features).toMatchObject({server: true, rpc: true, experimental: true})
    const bundle = (await kit.rpc.plugin.experimental({id: 'whiteboard'})).data
    expect(bundle.code).toContain('exports')

    const discover = makeDiscoverTools(kit.base, room)
    const offered = await discover(OFFERED_TOOLS)
    expect(offered.errors).toBeUndefined()
    expect(offered.tools.map((tool) => tool.name).toSorted()).toEqual(OFFERED_TOOLS.map((name) => `external_${name}`))
    for (const tool of offered.tools) expect(tool.description, tool.name).not.toBe('')
  })
})

describe('the whiteboard store and its rpc', () => {
  it('keeps rows per room named by the input, reads one row by id, refuses foreign or empty updates and gates element versions', async () => {
    const {kit, room} = await boot()

    const pin = {...pinRow('c1'), room}
    const {room: _pinRoom, ...pinInsert} = pin
    expect(PinSchema.parse(await call(kit, 'pins.insert', {room, row: pinInsert}))).toEqual(pin)
    expect(await call(kit, 'pins.list', {room})).toEqual([pin])
    expect(await call(kit, 'pins.list', {room: OTHER_ROOM})).toEqual([])
    expect(await call(kit, 'pins.get', {room, id: pin.id})).toEqual(pin)
    expect(await failureType(call(kit, 'pins.get', {room: OTHER_ROOM, id: pin.id}))).toBe('NOT_FOUND')
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
    const [stored] = z.array(CommentSchema).parse(await call(kit, 'comments.list', {room}))
    expect(CommentSchema.parse(await call(kit, 'comments.get', {room, id: stored?.id})).cid).toBe('cc1')
    expect(await failureType(call(kit, 'comments.get', {room, id: 'missing'}))).toBe('NOT_FOUND')
    expect(await failureType(call(kit, 'reads.get', {room, id: 'missing'}))).toBe('NOT_FOUND')
    expect(await failureType(call(kit, 'canvasPending.get', {room, id: 'missing'}))).toBe('NOT_FOUND')
    expect(await failureType(call(kit, 'canvasReplies.get', {room, id: 'missing'}))).toBe('NOT_FOUND')
    await call(kit, 'reads.insert', {room, row: {id: 'r1', threadId: 't1', accountId: 'a1', lastReadAt: 1}})
    await call(kit, 'canvasPending.insert', {room, row: {id: 'p1', kind: 'export', stage: 'live', payload: {}}})
    await call(kit, 'canvasReplies.insert', {room, row: {id: 'y1', requestId: 'q1', kind: 'export', payload: {}}})
    const roomRows = [
      {method: 'comments.get', id: stored?.id},
      {method: 'reads.get', id: 'r1'},
      {method: 'canvasPending.get', id: 'p1'},
      {method: 'canvasReplies.get', id: 'y1'},
    ]
    for (const {method, id} of roomRows) {
      expect(await call(kit, method, {room, id})).toMatchObject({id})
      expect(await failureType(call(kit, method, {room: OTHER_ROOM, id}))).toBe('NOT_FOUND')
    }

    const element = {elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    expect(await call(kit, 'elements.upsert', {room, scope: 'live', row: element})).toEqual({...element, room})
    expect(await call(kit, 'elements.get', {room, scope: 'live', elementId: 'e1'})).toEqual({...element, room})
    expect(await failureType(call(kit, 'elements.get', {room, scope: 'draft', elementId: 'e1'}))).toBe('NOT_FOUND')
    expect(await failureType(call(kit, 'elements.get', {room: OTHER_ROOM, scope: 'live', elementId: 'e1'}))).toBe(
      'NOT_FOUND',
    )
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

    await call(kit, 'elements.bulkUpsert', {
      room,
      scope: 'live',
      rows: [
        {elementId: 'z-bottom', data: {id: 'z-bottom', index: 'a0'}, version: 1},
        {elementId: 'a-top', data: {id: 'a-top', index: 'a1'}, version: 1},
      ],
    })
    expect(await useTool(kit, 'canvas_read')).toEqual({
      elements: [
        {id: 'z-bottom', index: 'a0'},
        {id: 'a-top', index: 'a1'},
      ],
      scope: 'live',
    })
    await call(kit, 'elements.upsert', {
      room,
      scope: 'live',
      row: {elementId: 'z-bottom', data: {id: 'z-bottom', index: 'a2'}, version: 2},
    })
    expect(await useTool(kit, 'canvas_read')).toEqual({
      elements: [
        {id: 'a-top', index: 'a1'},
        {id: 'z-bottom', index: 'a2'},
      ],
      scope: 'live',
    })
  })

  it('lets one tab at a time claim a pending row, and lets a claim that outlived its lease be taken again', async () => {
    const {kit, room} = await boot()
    await call(kit, 'canvasPending.insert', {room, row: {id: 'claimed', kind: 'export', stage: 'live', payload: {}}})

    expect(await call(kit, 'canvasPending.claim', {room, id: 'claimed'})).toEqual({claimed: true})
    expect(await call(kit, 'canvasPending.claim', {room, id: 'claimed'})).toEqual({claimed: false})
    expect(await call(kit, 'canvasPending.claim', {room: OTHER_ROOM, id: 'claimed'})).toEqual({claimed: false})

    onTestFinished(() => void vi.useRealTimers())
    vi.useFakeTimers({toFake: ['Date'], now: Date.now() + 60_000})
    expect(await call(kit, 'canvasPending.claim', {room, id: 'claimed'})).toEqual({claimed: true})
    expect(await call(kit, 'canvasPending.claim', {room, id: 'claimed'})).toEqual({claimed: false})
    vi.useRealTimers()

    await call(kit, 'canvasPending.remove', {room, id: 'claimed'})
    expect(await call(kit, 'canvasPending.claim', {room, id: 'claimed'})).toEqual({claimed: false})
    expect(await listPending(kit, room)).toEqual([])
  })

  it('keeps its board in the plugin storage of the state root, where a second engine on that root reads it back', async () => {
    const folder = tempDir('conciv-whiteboard-reopen-')

    const first = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR], stateRoot: folder})
    const room = await first.session()
    const pin = {...pinRow('kept'), room}
    const {room: _pinRoom, ...pinInsert} = pin
    const element = {elementId: 'kept', data: {type: 'rectangle'}, version: 1}
    const held = join(folder, 'src', 'Held.tsx')
    mkdirSync(join(folder, 'src'))
    execFileSync('mkfifo', [held])
    const heldComment = {
      ...commentRow('held'),
      kind: 'source-linked',
      anchor: {source: {file: 'src/Held.tsx', line: 4, column: 7}},
    }
    const fill = async () => {
      await call(first, 'comments.insert', {room, row: commentRow('kept')})
      await call(first, 'pins.insert', {room, row: pinInsert})
      await call(first, 'elements.upsert', {room, scope: 'live', row: element})
      await call(first, 'comments.insert', {room, row: heldComment})
      const enriching = await open(held, 'w')
      return {board: await board(first, room), enriching}
    }
    const {board: stored, enriching} = await fill().finally(() => first.cleanup())
    await enriching.writeFile(APP)
    await enriching.close()
    expect(
      z
        .array(CommentSchema)
        .parse(stored.comments)
        .map((row) => [row.cid, row.anchorHash]),
    ).toEqual([
      ['kept', null],
      ['held', null],
    ])
    expect(stored.pins).toEqual([pin])
    expect(stored.elements).toEqual([{...element, room}])

    const second = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR], stateRoot: folder})
    onTestFinished(() => second.cleanup())
    expect(second.stateRoot).toBe(folder)
    expect(await board(second, room)).toEqual(stored)
  })

  it('announces each stored change as ids and a per-room cursor, answers the missed changes since a cursor, broadcasts a live cursor to the room without storing it, and moves the agent cursor at most once per throttle window', async () => {
    const {kit, room} = await boot(undefined, {agentCursorMs: 60_000})
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

    const closing = new AbortController()
    const cursors = await kit.rpc.event.subscribe({types: ['rpc.whiteboard.cursor']}, {signal: closing.signal})
    expect(await cursors.next()).toMatchObject({done: false, value: {type: 'server.connected'}})
    const drawing = {
      peerId: `agent:${room}`,
      kind: 'agent',
      name: 'drawing…',
      color: '#8a86e8',
      x: 4,
      y: 5,
      lastSeen: 1,
    }
    const stamped = {...drawing, lastSeen: expect.any(Number)}
    expect(await call(kit, 'cursor.move', {room, cursor: drawing})).toEqual({ok: true})
    const moved = await nextCursor(cursors)
    expect(moved).toMatchObject({type: 'rpc.whiteboard.cursor', data: {...stamped, room}})
    expect(moved).not.toMatchObject({data: {lastSeen: drawing.lastSeen}})
    expect(await since(kit, room, 3)).toEqual({changes: [], cursor: 3})

    const parts = [{type: 'text', text: 'here'}]
    expect(
      await useTool(kit, 'comment_create', {cid: 'a1', kind: 'floating', parts, x: 7, y: 8, authorKind: 'ai'}),
    ).toEqual({cid: 'a1'})
    expect(await nextCursor(cursors)).toMatchObject({
      type: 'rpc.whiteboard.cursor',
      data: {room, kind: 'agent', color: '#19c3b2', x: 7, y: 8},
    })
    expect(await useTool(kit, 'comment_move', {cid: 'a1', x: 70, y: 80})).toEqual({cid: 'a1', x: 70, y: 80})
    expect(await call(kit, 'cursor.move', {room, cursor: {...drawing, x: 9}})).toEqual({ok: true})
    expect(await nextCursor(cursors)).toMatchObject({type: 'rpc.whiteboard.cursor', data: {...stamped, x: 9, room}})
    closing.abort()
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

    const covering = "x'/><rect x='0' y='0' width='999' height='999' fill='#ff0000"
    expect(
      await previewColours(kit, room, {fill: covering, line: covering, text: `${covering}'/><text fill='x`}),
    ).toEqual(await previewColours(kit, room, {fill: 'x', line: 'x', text: 'x'}))

    await closeCanvas()
    await rejection(useTool(kit, 'canvas_draw', {elements: [{type: 'ellipse', x: 0, y: 0}]}))
    expect(await listPending(kit, room)).toEqual([])
  })

  it('leaves an abandoned draft when a turn is stopped, and commits it when a turn finishes', async () => {
    const {kit, room} = await boot()
    await call(kit, 'elements.upsert', {room, scope: 'draft', row: {elementId: 'd1', data: {}, version: 1}})

    const runId = randomUUID()
    kit.harness.script.hold()
    const stopped = await kit.turn('draw something', {runId})
    await stopped.waitForRunStart({runId})
    await kit.rpc.chat.stop({sessionId: room, runIds: [runId]})
    kit.harness.script.release()
    await stopped.done()
    await kit.hydrate(room)
    expect((await listElements(kit, room, 'draft')).map((row) => row.elementId)).toEqual(['d1'])
    expect(await listElements(kit, room, 'live')).toEqual([])
    expect(await listPending(kit, room)).toEqual([])

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
  it('creates, replies to, reads, lists and moves comments with the agent cursor at each spot, sets pin state, and asks before deleting, clearing, resolving or removing', async () => {
    const {kit, room} = await boot(undefined, {agentCursorMs: 1})
    const closing = new AbortController()
    onTestFinished(() => closing.abort())
    const cursors = await kit.rpc.event.subscribe({types: ['rpc.whiteboard.cursor']}, {signal: closing.signal})
    expect(await cursors.next()).toMatchObject({done: false, value: {type: 'server.connected'}})
    const agentAt = (x: number, y: number) => ({
      type: 'rpc.whiteboard.cursor',
      data: {room, peerId: 'agent:ai', kind: 'agent', name: 'AI', color: '#19c3b2', x, y},
    })
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
    expect(await nextCursor(cursors)).toMatchObject(agentAt(5, 6))

    const reply = z
      .object({cid: z.string()})
      .parse(await useTool(kit, 'comment_reply', {cid: 'root', parts: [{type: 'text', text: 'agreed'}]}))
    expect(await nextCursor(cursors)).toMatchObject(agentAt(5, 6))
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
    expect(await nextCursor(cursors)).toMatchObject(agentAt(50, 60))
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

describe('the pending request machine', () => {
  it('waits for the deadline, follows a claim lease, ignores stale attempts and ends once', () => {
    const started = startPending(8_000)
    expect(started.effects).toEqual([{type: 'wait', attempt: 0, ms: 8_000}])
    const stale = transitionPending(started.state, {type: 'waitExpired', attempt: 3, claim: {status: 'gone'}, now: 0})
    expect(stale.state).toBe(started.state)
    expect(stale.effects).toEqual([])
    expect(
      transitionPending(started.state, {type: 'waitExpired', attempt: 0, claim: {status: 'unclaimed'}, now: 8_000}),
    ).toEqual({state: {status: 'done', outcome: 'unclaimed'}, effects: [{type: 'finish', outcome: 'unclaimed'}]})
    expect(
      transitionPending(started.state, {type: 'waitExpired', attempt: 0, claim: {status: 'gone'}, now: 8_000}).state,
    ).toEqual({status: 'done', outcome: 'drawn'})
    const claimed = transitionPending(started.state, {
      type: 'waitExpired',
      attempt: 0,
      claim: {status: 'claimed', until: 30_000},
      now: 8_000,
    })
    expect(claimed).toEqual({
      state: {status: 'claimed', attempt: 1, leaseUntil: 30_000},
      effects: [{type: 'wait', attempt: 1, ms: 22_000}],
    })
    const expired = transitionPending(claimed.state, {
      type: 'waitExpired',
      attempt: 1,
      claim: {status: 'claimed', until: 30_000},
      now: 30_000,
    })
    expect(expired.state).toEqual({status: 'done', outcome: 'unfinished'})
    expect(transitionPending(claimed.state, {type: 'drained'}).state).toEqual({status: 'done', outcome: 'drawn'})
    const disposed = transitionPending(claimed.state, {type: 'disposed'})
    expect(disposed).toEqual({state: {status: 'disposed'}, effects: []})
    const after: PendingState = disposed.state
    expect(transitionPending(after, {type: 'drained'}).state).toBe(after)
    expect(transitionPending(expired.state, {type: 'drained'}).state).toBe(expired.state)
  })
})

const memoryStorage = Effect.gen(function* () {
  const entries = yield* Ref.make<Readonly<Record<string, Schema.Json>>>({})
  const storage: PluginContext['storage'] = {
    directory: '',
    get: (key) => Ref.get(entries).pipe(Effect.map((all) => Object.entries(all).find(([name]) => name === key)?.[1])),
    set: (key, value) => Ref.update(entries, (all) => ({...all, [key]: value})),
    remove: (key) =>
      Ref.update(entries, (all) => Object.fromEntries(Object.entries(all).filter(([name]) => name !== key))),
    scan: ({prefix, after}) =>
      Ref.get(entries).pipe(
        Effect.map((all) => ({
          entries: Object.entries(all)
            .filter(([key]) => key.startsWith(prefix) && (after === undefined || key > after))
            .toSorted(([left], [right]) => (left < right ? -1 : 1))
            .map(([key, value]) => ({key, value})),
        })),
      ),
  }
  return yield* makeWhiteboardStore(storage)
})

const ROOM = 'conciv_clocked'

function failureCode<Value, Failure>(exit: Exit.Exit<Value, Failure>): unknown {
  if (Exit.isSuccess(exit)) return 'answered'
  const failure = Cause.squash(exit.cause)
  if (!Tool.isToolError(failure)) return 'no tool failure'
  return failure.metadata?.['code']
}

function clocked<Value, Failure>(program: Effect.Effect<Value, Failure>) {
  return Effect.runPromise(program.pipe(Effect.provide(TestClock.layer())))
}

describe('the pending request driver on the test clock', () => {
  it('answers unclaimed at the draw deadline, waits out a claim lease, and times out a commit and an export', async () => {
    const outcomes = await clocked(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* memoryStorage
          const insert = (id: string) =>
            store.pending.insert(ROOM, {id, room: ROOM, kind: 'skeletons', stage: 'draft', payload: {}})
          const unclaimed = yield* Effect.forkChild(Effect.scoped(awaitDrawing(store, ROOM, insert, 8_000)), {
            startImmediately: true,
          })
          yield* TestClock.adjust(7_999)
          expect(unclaimed.pollUnsafe()).toBeUndefined()
          yield* TestClock.adjust(1)
          const first = yield* Fiber.join(unclaimed)

          const leased = yield* Effect.forkChild(
            Effect.scoped(
              awaitDrawing(store, ROOM, (id) => insert(id).pipe(Effect.andThen(store.pending.claim(ROOM, id))), 8_000),
            ),
            {startImmediately: true},
          )
          yield* TestClock.adjust(8_000)
          expect(leased.pollUnsafe()).toBeUndefined()
          yield* TestClock.adjust(22_000)
          const second = yield* Fiber.join(leased)

          const drained = yield* Effect.forkChild(
            Effect.scoped(
              awaitDrawing(store, ROOM, (id) => insert(id).pipe(Effect.andThen(store.pending.remove(ROOM, id))), 8_000),
            ),
            {startImmediately: true},
          )
          const third = yield* Fiber.join(drained)

          yield* store.upsertElement('draft', {room: ROOM, elementId: 'kept', data: {}, version: 1})
          const commit = yield* Effect.forkChild(Effect.exit(commitDraft(store, ROOM)), {startImmediately: true})
          yield* TestClock.adjust(15_000)
          const committed = yield* Fiber.join(commit)
          const exporting = yield* Effect.forkChild(Effect.exit(exportPng(store, ROOM, 'live')), {
            startImmediately: true,
          })
          yield* TestClock.adjust(10_000)
          const exported = yield* Fiber.join(exporting)
          return [first.outcome, second.outcome, third.outcome, failureCode(committed), failureCode(exported)]
        }),
      ),
    )
    expect(outcomes).toEqual(['unclaimed', 'unfinished', 'drawn', 'COMMIT_TIMEOUT', 'EXPORT_TIMEOUT'])
  })
})

describe('the change feed machine', () => {
  it('reads the position, catches up, routes only newer changes, reloads when the stream stops, and is disposed once', () => {
    const change = (cursor: number): FeedChange => ({table: 'pins', key: `pin-${cursor}`, type: 'upsert', cursor})
    const opening = startChangeFeed()
    expect(opening.effects).toEqual([{type: 'readPosition', attempt: 0}, {type: 'subscribe'}])
    expect(transitionChangeFeed(opening.state, {type: 'connected'}).state).toBe(opening.state)
    const early = transitionChangeFeed(opening.state, {type: 'changed', change: change(3)})
    expect(early.effects).toEqual([{type: 'route', changes: [change(3)]}])
    expect(transitionChangeFeed(early.state, {type: 'positionRead', attempt: 9, cursor: 5}).state).toBe(early.state)
    const catching = transitionChangeFeed(early.state, {type: 'positionRead', attempt: 0, cursor: 5})
    expect(catching).toEqual({
      state: {status: 'catchingUp', attempt: 1, cursor: 5},
      effects: [{type: 'opened'}, {type: 'readSince', attempt: 1, cursor: 5}],
    })
    expect(transitionChangeFeed(catching.state, {type: 'sinceRead', attempt: 0, changes: []}).state).toBe(
      catching.state,
    )
    const during = transitionChangeFeed(catching.state, {type: 'changed', change: change(6)})
    expect(during.state).toEqual({status: 'catchingUp', attempt: 1, cursor: 6})
    const live = transitionChangeFeed(during.state, {type: 'sinceRead', attempt: 1, changes: [change(5), change(7)]})
    expect(live).toEqual({
      state: {status: 'live', attempt: 1, cursor: 7},
      effects: [{type: 'route', changes: [change(7)]}],
    })
    expect(transitionChangeFeed(live.state, {type: 'connected'}).effects).toEqual([
      {type: 'readSince', attempt: 2, cursor: 7},
    ])
    const reloading = transitionChangeFeed(live.state, {type: 'streamStopped'})
    expect(reloading.effects).toEqual([{type: 'readPosition', attempt: 2}])
    expect(transitionChangeFeed(reloading.state, {type: 'positionRead', attempt: 2, cursor: 4})).toEqual({
      state: {status: 'live', attempt: 2, cursor: 7},
      effects: [{type: 'reload'}, {type: 'subscribe'}],
    })
    const disposed = transitionChangeFeed(reloading.state, {type: 'disposed'})
    expect(disposed).toEqual({state: {status: 'disposed'}, effects: []})
    expect(transitionChangeFeed(disposed.state, {type: 'changed', change: change(9)}).state).toBe(disposed.state)
  })
})

describe('the change feed driver on the test clock', () => {
  it('retries the position read with backoff, catches up, routes per table, reloads when the events stop, and disposes with its scope', async () => {
    const pin = (cursor: number): FeedChange => ({table: 'pins', key: `pin-${cursor}`, type: 'upsert', cursor})
    const result = await clocked(
      Effect.gen(function* () {
        const calls = yield* Ref.make<readonly number[]>([])
        const bus = yield* PubSub.unbounded<FeedEvent | 'stop'>()
        const changes: readonly FeedChange[] = [pin(5), pin(6), {...pin(7), table: 'comments'}]
        const source = {
          since: (cursor: number) =>
            Ref.updateAndGet(calls, (all) => [...all, cursor]).pipe(
              Effect.flatMap((all) =>
                all.length < 3
                  ? Effect.fail(SinceFailed.make({message: 'offline'}))
                  : Effect.succeed({
                      cursor: all.length < 4 ? 5 : 8,
                      changes: changes.filter((change) => change.cursor > cursor),
                    }),
              ),
            ),
          events: Stream.fromPubSub(bus).pipe(
            Stream.mapEffect((event) =>
              event === 'stop' ? Effect.fail(EventsStopped.make({message: 'gone'})) : Effect.succeed(event),
            ),
          ),
        }
        const scope = yield* Scope.make()
        const feed = yield* makeChangeFeed(source, {retryMs: 100}).pipe(Scope.provide(scope))
        const routed = yield* Ref.make<readonly ChangeMessage[]>([])
        const pins = yield* feed.follow('pins').pipe(Scope.provide(scope))
        yield* Effect.forkIn(
          Stream.runForEach(pins, (message) => Ref.update(routed, (all) => [...all, message])),
          scope,
          {startImmediately: true},
        )
        yield* TestClock.adjust(79)
        const beforeRetry = (yield* Ref.get(calls)).length
        yield* TestClock.adjust(41)
        const afterRetry = (yield* Ref.get(calls)).length
        yield* TestClock.adjust(240)
        const caughtUp = yield* SubscriptionRef.get(feed.state)
        yield* PubSub.publish(bus, {type: 'changed', change: pin(6)})
        yield* PubSub.publish(bus, {type: 'changed', change: pin(8)})
        yield* TestClock.adjust(0)
        yield* PubSub.publish(bus, 'stop')
        yield* TestClock.adjust(0)
        const reloaded = yield* SubscriptionRef.get(feed.state)
        yield* Scope.close(scope, Exit.void)
        return {
          beforeRetry,
          afterRetry,
          caughtUp,
          reloaded,
          disposed: yield* SubscriptionRef.get(feed.state),
          calls: yield* Ref.get(calls),
          routed: yield* Ref.get(routed),
        }
      }),
    )
    expect(result).toEqual({
      beforeRetry: 1,
      afterRetry: 2,
      caughtUp: {status: 'live', attempt: 1, cursor: 7},
      reloaded: {status: 'live', attempt: 2, cursor: 8},
      disposed: {status: 'disposed'},
      calls: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 5, Number.MAX_SAFE_INTEGER],
      routed: [{type: 'upsert', key: 'pin-6'}, {type: 'upsert', key: 'pin-8'}, {type: 'reload'}],
    })
  })
})

const pendingRow = (id: string): PendingRow => ({
  id,
  room: 'conciv_drain',
  kind: 'skeletons',
  stage: 'draft',
  payload: {},
})

describe('the canvas drain machine', () => {
  it('claims each new row once, runs then removes it, forgets a refused claim, ignores stale results, and stops on dispose', () => {
    const row = pendingRow
    const seen = transitionDrain(startDrain().state, {type: 'seen', rows: [row('a'), row('b')]})
    expect(seen.effects).toEqual([
      {type: 'claim', attempt: 0, row: row('a')},
      {type: 'claim', attempt: 1, row: row('b')},
    ])
    expect(transitionDrain(seen.state, {type: 'seen', rows: [row('a'), row('b')]}).state).toBe(seen.state)
    const running = transitionDrain(seen.state, {type: 'claimed', id: 'a', attempt: 0, claimed: true})
    expect(running.effects).toEqual([{type: 'run', attempt: 0, row: row('a')}])
    const refused = transitionDrain(running.state, {type: 'claimed', id: 'b', attempt: 1, claimed: false})
    const again = transitionDrain(refused.state, {type: 'seen', rows: [row('b')]})
    expect(again.effects).toEqual([{type: 'claim', attempt: 2, row: row('b')}])
    expect(transitionDrain(again.state, {type: 'claimed', id: 'b', attempt: 1, claimed: true}).state).toBe(again.state)
    const removing = transitionDrain(again.state, {type: 'ran', id: 'a', attempt: 0})
    expect(removing.effects).toEqual([{type: 'remove', attempt: 0, row: row('a')}])
    const done = transitionDrain(removing.state, {type: 'removed', id: 'a', attempt: 0})
    expect(transitionDrain(done.state, {type: 'seen', rows: [row('a')]}).effects).toEqual([])
    const disposed = transitionDrain(done.state, {type: 'disposed'})
    expect(disposed).toEqual({state: {status: 'disposed'}, effects: []})
    expect(transitionDrain(disposed.state, {type: 'claimed', id: 'b', attempt: 2, claimed: true}).state).toBe(
      disposed.state,
    )
  })
})

describe('the canvas scene versions', () => {
  it('applies a remote change once, never echoes it back as a local write, and writes only real local edits', () => {
    const element = (id: string, version: number, versionNonce = 1) => ({id, version, versionNonce})
    const row = (id: string, version: number, versionNonce = 1) => ({
      room: 'room',
      elementId: id,
      version,
      data: element(id, version, versionNonce),
    })
    const result = Effect.runSync(
      Effect.gen(function* () {
        const scene = yield* makeSceneVersions()
        yield* scene.seed([row('a', 1)])
        const seededEcho = yield* scene.takeLocal([element('a', 1)])
        const remoteNewer = yield* scene.acceptRemote([row('a', 2), row('b', 1)], [element('a', 1)])
        const remoteEcho = yield* scene.takeLocal([element('a', 2), element('b', 1)])
        const localEdit = yield* scene.takeLocal([element('a', 3), element('b', 1)])
        const ownWriteBack = yield* scene.acceptRemote([row('a', 3), row('b', 1)], [element('a', 3), element('b', 1)])
        const lostTie = yield* scene.acceptRemote([row('a', 3, 9), row('b', 1)], [element('a', 3, 7), element('b', 1)])
        const removed = yield* scene.acceptRemote([row('a', 3, 9)], [element('a', 3, 9), element('b', 1)])
        const removedEcho = yield* scene.takeLocal([element('a', 3, 9)])
        return {seededEcho, remoteNewer, remoteEcho, localEdit, ownWriteBack, lostTie, removed, removedEcho}
      }),
    )
    expect(result).toEqual({
      seededEcho: [],
      remoteNewer: true,
      remoteEcho: [],
      localEdit: [element('a', 3)],
      ownWriteBack: false,
      lostTie: true,
      removed: true,
      removedEcho: [],
    })
  })
})

describe('the canvas drain driver on the test clock', () => {
  it('removes a row after every exit of its work, retries a failed removal with backoff, re-claims a refused row, and disposes with its scope', async () => {
    const result = await clocked(
      Effect.gen(function* () {
        const log = yield* Ref.make<readonly string[]>([])
        const count = (entry: string) =>
          Ref.get(log).pipe(Effect.map((all) => all.filter((item) => item === entry).length))
        const note = (entry: string) =>
          Ref.updateAndGet(log, (all) => [...all, entry]).pipe(Effect.flatMap(() => count(entry)))
        const work = {
          claim: (row: PendingRow) =>
            note(`claim ${row.id}`).pipe(Effect.map((tries) => row.id !== 'refused' || tries > 1)),
          perform: (row: PendingRow) =>
            note(`perform ${row.id}`).pipe(
              Effect.andThen(row.id === 'broken' ? Effect.die('bad payload') : Effect.void),
            ),
          remove: (row: PendingRow) =>
            note(`remove ${row.id}`).pipe(
              Effect.flatMap((tries) =>
                row.id === 'drawn' && tries < 3 ? Effect.fail(RemoveFailed.make({message: 'offline'})) : Effect.void,
              ),
            ),
        }
        const scope = yield* Scope.make()
        const drain = yield* makePendingDrain(work, {removeRetryMs: 100}).pipe(Scope.provide(scope))
        const phases = (state: DrainState) =>
          state.status === 'active' ? mapValues(state.rows, (row) => row.phase) : {}
        const until = (wanted: Record<string, string>) =>
          SubscriptionRef.changes(drain.state).pipe(
            Stream.map(phases),
            Stream.filter((current) => isEqual(current, wanted)),
            Stream.runHead,
          )
        yield* drain.see([pendingRow('drawn'), pendingRow('broken'), pendingRow('refused')])
        const first = yield* until({drawn: 'removing', broken: 'done'})
        yield* TestClock.adjust(79)
        const beforeRetry = yield* count('remove drawn')
        yield* TestClock.adjust(41)
        const afterRetry = yield* count('remove drawn')
        yield* TestClock.adjust(240)
        yield* until({drawn: 'done', broken: 'done'})
        yield* drain.see([pendingRow('refused')])
        const settled = yield* until({drawn: 'done', broken: 'done', refused: 'done'})
        yield* Scope.close(scope, Exit.void)
        const disposed = (yield* SubscriptionRef.get(drain.state)).status
        return {first, beforeRetry, afterRetry, settled, disposed, log: (yield* Ref.get(log)).toSorted()}
      }),
    )
    expect(result).toEqual({
      first: Option.some({drawn: 'removing', broken: 'done'}),
      beforeRetry: 1,
      afterRetry: 2,
      settled: Option.some({drawn: 'done', broken: 'done', refused: 'done'}),
      disposed: 'disposed',
      log: [
        'claim broken',
        'claim drawn',
        'claim refused',
        'claim refused',
        'perform broken',
        'perform drawn',
        'perform refused',
        'remove broken',
        'remove drawn',
        'remove drawn',
        'remove drawn',
        'remove refused',
      ],
    })
  })
})

describe('the commit replay on the test clock', () => {
  it('writes the first draft element at once, the next after a step, and the rest at once when skipped', async () => {
    const result = await clocked(
      Effect.gen(function* () {
        const written = yield* Ref.make<readonly string[]>([])
        const step = (elementId: string) => ({
          elementId,
          write: () => Effect.runSync(Ref.updateAndGet(written, (all) => [...all, elementId])),
        })
        const skipped = yield* Deferred.make<void>()
        const replay = yield* Effect.forkChild(replayDraft([step('a'), step('b'), step('c'), step('d')], skipped), {
          startImmediately: true,
        })
        const first = yield* Ref.get(written)
        yield* TestClock.adjust(399)
        const beforeStep = yield* Ref.get(written)
        yield* TestClock.adjust(1)
        const afterStep = yield* Ref.get(written)
        yield* Deferred.succeed(skipped, undefined)
        const results = yield* Fiber.join(replay)
        return {first, beforeStep, afterStep, results: results.map((all) => all.at(-1))}
      }),
    )
    expect(result).toEqual({first: ['a'], beforeStep: ['a'], afterStep: ['a', 'b'], results: ['a', 'b', 'c', 'd']})
  })
})
