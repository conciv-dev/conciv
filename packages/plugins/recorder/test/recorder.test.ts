import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it, onTestFinished} from 'vitest'
import {z} from 'zod'
import {makeDiscoverTools} from '@conciv/harness-testkit'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

const RrwebEventSchema = z.object({type: z.number(), data: z.unknown(), timestamp: z.number()})
const EventWindowSchema = z.object({events: z.array(RrwebEventSchema), cursor: z.number()})
const LogSchema = z.object({entries: z.array(z.object({ts: z.number(), kind: z.string(), detail: z.string()}))})
const SavedSchema = z.object({recordingId: z.string()})
const RpcFailureSchema = z.object({data: z.object({type: z.string()})})

type RrwebEvent = z.infer<typeof RrwebEventSchema>

function pageFixture(children: unknown[]): unknown {
  return {
    id: 1,
    type: 0,
    childNodes: [
      {
        id: 2,
        type: 2,
        tagName: 'html',
        attributes: {},
        childNodes: [{id: 3, type: 2, tagName: 'body', attributes: {}, childNodes: children}],
      },
    ],
  }
}

function buttonFixture(id: number, textId: number, text: string): unknown {
  return {id, type: 2, tagName: 'button', attributes: {}, childNodes: [{id: textId, type: 3, textContent: text}]}
}

function fixtureStream(base: number, label = 'Buy'): RrwebEvent[] {
  return [
    {type: 4, data: {href: 'http://localhost/app', width: 800, height: 600}, timestamp: base},
    {type: 2, data: {node: pageFixture([buttonFixture(4, 5, label)])}, timestamp: base + 1},
    {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: base + 2},
  ]
}

const ControlEventSchema = z.object({type: z.literal('rpc.recorder.control'), data: z.record(z.string(), z.boolean())})
const AppendedEventSchema = z.object({
  type: z.literal('rpc.recorder.appended'),
  data: z.strictObject({clientId: z.string(), cursor: z.number()}),
})
const RecorderEventSchema = z.union([ControlEventSchema, AppendedEventSchema])
const StartedSchema = z.object({captureId: z.string(), startedAt: z.number()})
const RecordingPartsSchema = z.array(z.object({type: z.string(), text: z.string().optional()}))

async function bootRecorder(): Promise<CoreKit> {
  const kit = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR]})
  onTestFinished(() => kit.cleanup())
  return kit
}

async function followEvents(kit: CoreKit): Promise<() => Promise<z.infer<typeof RecorderEventSchema>>> {
  const following = new AbortController()
  onTestFinished(() => following.abort())
  const stream = await kit.rpc.plugin.events(
    {rpcId: 'recorder', types: ['control', 'appended']},
    {signal: following.signal},
  )
  const iterator = stream[Symbol.asyncIterator]()
  return async () => {
    const next = await iterator.next()
    if (next.done) throw new Error('the recorder event stream ended')
    return RecorderEventSchema.parse(next.value)
  }
}

function useTool(kit: CoreKit, name: 'start' | 'stop' | 'pull', input: unknown = {}): Promise<unknown> {
  return kit.callTool(`recording_${name}`, input)
}

function call(kit: CoreKit, method: string, input: unknown = {}): Promise<unknown> {
  return kit.rpc.plugin.call({rpcId: 'recorder', method, input}, {signal: AbortSignal.timeout(30_000)})
}

function logText(value: unknown): string {
  return RecordingPartsSchema.parse(value)
    .flatMap((part) => (part.text === undefined ? [] : [part.text]))
    .join('\n')
}

async function failureType(pending: Promise<unknown>): Promise<string> {
  const failure = await pending.then(
    () => new Error('the call answered instead of failing'),
    (error: unknown) => error,
  )
  return RpcFailureSchema.parse(failure).data.type
}

async function filesNamed(root: string, name: string): Promise<string[]> {
  const entries = await readdir(root, {recursive: true})
  return entries.filter((entry) => entry.endsWith(name)).map((entry) => join(root, entry))
}

describe('the recorder plugin in a real engine', () => {
  it('is active', async () => {
    const kit = await bootRecorder()
    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'recorder')
    expect(plugin?.state).toEqual({status: 'active'})
  })
})

describe('the recorder RPC', () => {
  it('serves config defaults, round trips flush to window to log, pins reads and saves to a client id, keeps recordings in the plugin storage and resets', async () => {
    const kit = await bootRecorder()

    expect(await call(kit, 'config')).toEqual({masking: 'none', windowMinutes: 10, console: true})

    const base = Date.now()
    expect(await call(kit, 'flush', {clientId: 'mine', events: fixtureStream(base)})).toEqual({ok: true})
    const mine = EventWindowSchema.parse(await call(kit, 'window', {clientId: 'mine'}))
    expect(mine.events).toHaveLength(3)
    expect(mine.cursor).toBeGreaterThan(0)

    const log = LogSchema.parse(await call(kit, 'log', {clientId: 'mine'}))
    expect(log.entries.map((entry) => entry.kind)).toEqual(['navigation', 'click'])
    expect(log.entries[1]?.detail).toContain('Buy')

    await call(kit, 'flush', {clientId: 'other', events: fixtureStream(base + 5000, 'Sell')})
    const pinned = EventWindowSchema.parse(await call(kit, 'window', {clientId: 'mine'}))
    expect(pinned.events.map((event) => event.timestamp)).toEqual([base, base + 1, base + 2])
    expect(
      z
        .object({clients: z.array(z.object({id: z.string()}))})
        .parse(await call(kit, 'clients'))
        .clients.map((client) => client.id),
    ).toEqual(['mine', 'other'])

    const saved = SavedSchema.parse(await call(kit, 'recordings.save', {clientId: 'mine'}))
    expect(await call(kit, 'recordings.get', {recordingId: saved.recordingId})).toEqual({events: mine.events})
    const stored = await filesNamed(kit.stateRoot, `${saved.recordingId}.json`)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toContain('plugin-storage')

    expect(await call(kit, 'recordings.get', {recordingId: 'missing-recording'})).toEqual({expired: true})
    expect(await call(kit, 'recordings.save', {clientId: 'nobody'})).toEqual({error: 'empty'})
    expect(await failureType(call(kit, 'recordings.save', {clientId: ''}))).toBe('rpc.invalid_input')

    const event = (timestamp: number) => ({type: 3, data: {}, timestamp})
    expect(await call(kit, 'flush', {clientId: 'mine', events: [event(base + 3)]})).toEqual({ok: true})
    const tooMany = Array.from({length: 5001}, (_, index) => event(index))
    expect(await failureType(call(kit, 'flush', {clientId: 'mine', events: tooMany}))).toBe('rpc.invalid_input')

    expect(await call(kit, 'reset')).toEqual({ok: true})
    expect(EventWindowSchema.parse(await call(kit, 'window', {clientId: 'mine'})).events).toEqual([])
  })
})

describe('the recorder RPC events', () => {
  it('answers the live state, announces each flush with its client id and cursor only, serves the missed deltas with since, and asks for a snapshot on reset', async () => {
    const kit = await bootRecorder()
    expect(await call(kit, 'state')).toEqual({live: false})
    const nextEvent = await followEvents(kit)

    const base = Date.now()
    await call(kit, 'flush', {clientId: 'mine', events: fixtureStream(base)})
    const first = await nextEvent()
    const head = EventWindowSchema.parse(await call(kit, 'window', {clientId: 'mine'})).cursor
    expect(first).toEqual({type: 'rpc.recorder.appended', data: {clientId: 'mine', cursor: head}})

    expect(EventWindowSchema.parse(await call(kit, 'since', {clientId: 'mine', cursor: 0}))).toEqual({
      events: fixtureStream(base),
      cursor: head,
    })

    const sameTimestamp = {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: base + 2}
    await call(kit, 'flush', {clientId: 'mine', events: [sameTimestamp]})
    const second = await nextEvent()
    expect(second.type).toBe('rpc.recorder.appended')
    const delta = EventWindowSchema.parse(await call(kit, 'since', {clientId: 'mine', cursor: head}))
    expect(delta.events).toEqual([sameTimestamp])
    expect(second.data).toEqual({clientId: 'mine', cursor: delta.cursor})

    expect(await call(kit, 'reset')).toEqual({ok: true})
    expect(await nextEvent()).toEqual({type: 'rpc.recorder.control', data: {snapshot: true, flush: true}})
  })
})

describe('the recorder viewer presence', () => {
  it('turns capture live for a new viewer and asks for a snapshot, renews a lease without a new snapshot, and turns it off when the viewer leaves', async () => {
    const kit = await bootRecorder()
    const nextEvent = await followEvents(kit)

    expect(await call(kit, 'presence', {viewerId: 'viewer-1', live: true})).toEqual({ok: true})
    expect(await nextEvent()).toEqual({type: 'rpc.recorder.control', data: {live: true}})
    expect(await nextEvent()).toEqual({type: 'rpc.recorder.control', data: {snapshot: true, flush: true}})
    expect(await call(kit, 'state')).toEqual({live: true})

    expect(await call(kit, 'presence', {viewerId: 'viewer-1', live: true})).toEqual({ok: true})
    expect(await call(kit, 'presence', {viewerId: 'viewer-1', live: false})).toEqual({ok: true})
    expect(await nextEvent()).toEqual({type: 'rpc.recorder.control', data: {live: false}})
    expect(await call(kit, 'state')).toEqual({live: false})
  })
})

describe('the recording tools', () => {
  it('are offered as recording_start, recording_stop and recording_pull, answer an error without a page client, record what a flushing client sends between start and stop, and pull the last seconds', async () => {
    const kit = await bootRecorder()

    const discovered = await makeDiscoverTools(
      kit.base,
      await kit.session(),
    )(['recording_start', 'recording_stop', 'recording_pull'])
    expect(discovered.tools.map((tool) => tool.name)).toEqual([
      'external_recording_start',
      'external_recording_stop',
      'external_recording_pull',
    ])

    expect(await useTool(kit, 'start')).toEqual({
      error: 'no page client attached within 5s; the app page with the widget must be open to record',
    })

    const nextEvent = await followEvents(kit)
    const starting = useTool(kit, 'start')
    expect(await nextEvent()).toEqual({type: 'rpc.recorder.control', data: {live: true, snapshot: true, flush: true}})
    await call(kit, 'flush', {clientId: 'page', events: fixtureStream(Date.now())})
    const started = StartedSchema.parse(await starting)
    expect(await nextEvent()).toMatchObject({type: 'rpc.recorder.appended'})

    const stopped = logText(await useTool(kit, 'stop', {captureId: started.captureId, keyframes: 0}))
    expect(stopped).toContain('[click]')
    expect(stopped).toContain('Buy')
    expect(await nextEvent()).toEqual({type: 'rpc.recorder.control', data: {flush: true, live: false}})

    expect(await useTool(kit, 'stop', {captureId: 'not-a-capture', keyframes: 0})).toEqual({
      error: 'no active capture not-a-capture',
    })

    const pulled = logText(await useTool(kit, 'pull', {secondsBack: 60, keyframes: 0}))
    expect(pulled).toContain('Buy')
  })
})
