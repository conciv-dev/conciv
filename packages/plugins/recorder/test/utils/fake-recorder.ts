import type {FakePluginHandler} from '@conciv/client/testing'
import {distill, recordingSummary} from '../../src/distill.js'
import {RrwebEventSchema, type RecorderConfig, type RrwebEvent} from '../../src/rpc.js'

type Saved = {readonly kind: 'found'; readonly events: readonly RrwebEvent[]} | {readonly kind: 'missing'}

export type FakeRecorder = {
  readonly handlers: Readonly<Record<string, FakePluginHandler>>
  readonly flushed: () => readonly RrwebEvent[]
  readonly recordings: Map<string, Saved>
}

function readEvents(input: unknown): RrwebEvent[] {
  if (typeof input !== 'object' || input === null) return []
  const events: unknown = Reflect.get(input, 'events')
  return Array.isArray(events) ? events.flatMap((event) => RrwebEventSchema.safeParse(event).data ?? []) : []
}

function readString(input: unknown, key: string): string {
  const value: unknown = typeof input === 'object' && input !== null ? Reflect.get(input, key) : undefined
  return typeof value === 'string' ? value : ''
}

function readNumber(input: unknown, key: string): number {
  const value: unknown = typeof input === 'object' && input !== null ? Reflect.get(input, key) : undefined
  return typeof value === 'number' ? value : 0
}

function readFlag(input: unknown, key: string): boolean {
  return typeof input === 'object' && input !== null && Reflect.get(input, key) === true
}

export function createFakeRecorder(config: RecorderConfig): FakeRecorder {
  const events: RrwebEvent[] = []
  const recordings = new Map<string, Saved>()
  const viewers = new Set<string>()
  return {
    flushed: () => [...events],
    recordings,
    handlers: {
      config: () => config,
      clients: () => ({clients: [{id: 'page', lastSeen: Date.now()}]}),
      state: () => ({live: viewers.size > 0}),
      flush: (input, call) => {
        events.push(...readEvents(input))
        call.emit('rpc.recorder.appended', {clientId: readString(input, 'clientId'), cursor: events.length})
        return {ok: true}
      },
      window: () => ({events: [...events], cursor: events.length}),
      since: (input) => ({events: events.slice(readNumber(input, 'cursor')), cursor: events.length}),
      presence: (input, call) => {
        const viewer = readString(input, 'viewerId')
        if (readFlag(input, 'live')) viewers.add(viewer)
        else viewers.delete(viewer)
        call.emit('rpc.recorder.control', {live: viewers.size > 0, snapshot: viewers.size > 0})
        return {ok: true}
      },
      reset: () => {
        events.splice(0)
        return {ok: true}
      },
      'recordings.save': () => {
        if (events.length === 0) return {saved: false, error: 'empty'}
        const recordingId = `rec_${crypto.randomUUID()}`
        recordings.set(recordingId, {kind: 'found', events: [...events]})
        return {saved: true, recordingId, summary: recordingSummary(distill([...events]))}
      },
      'recordings.get': (input) => recordings.get(readString(input, 'recordingId')) ?? {kind: 'missing'},
    },
  }
}

export const RECORDER_BUILD = {
  id: 'recorder',
  dist: import.meta.glob<string>(['../../dist/*.cjs', '../../dist/*.cjs.manifest.json'], {
    query: '?raw',
    import: 'default',
  }),
}
