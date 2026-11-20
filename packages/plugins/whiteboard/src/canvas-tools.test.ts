import {describe, expect, it} from 'vitest'
import {Cause, Effect, Exit, Fiber, Ref, type Schema} from 'effect'
import {TestClock} from 'effect/testing'
import type {Context as PluginContext} from '@conciv/plugin/effect/plugin'
import {Tool} from '@conciv/plugin/schema/tool'
import {makeWhiteboardStore} from './store.js'
import {commitDraft, exportPng} from './canvas-tools.js'

const ROOM = 'conciv_short_deadlines'

const memoryStore = Effect.gen(function* () {
  const entries = yield* Ref.make<Readonly<Record<string, Schema.Json>>>({})
  const storage: PluginContext['storage'] = {
    directory: '',
    get: (key) => Ref.get(entries).pipe(Effect.map((all) => all[key])),
    set: (key, value) => Ref.update(entries, (all) => ({...all, [key]: value})),
    remove: (key) =>
      Ref.update(entries, (all) => Object.fromEntries(Object.entries(all).filter(([name]) => name !== key))),
    scan: ({prefix}) =>
      Ref.get(entries).pipe(
        Effect.map((all) => ({
          entries: Object.entries(all)
            .filter(([key]) => key.startsWith(prefix))
            .toSorted(([left], [right]) => (left < right ? -1 : 1))
            .map(([key, value]) => ({key, value})),
        })),
      ),
  }
  return yield* makeWhiteboardStore(storage)
})

function readFailureCode<Value, Failure>(exit: Exit.Exit<Value, Failure> | undefined): unknown {
  if (exit === undefined) return 'still waiting'
  if (Exit.isSuccess(exit)) return 'answered'
  const failure = Cause.squash(exit.cause)
  if (!Tool.isToolError(failure)) return 'no tool failure'
  return failure.metadata?.['code']
}

describe('canvas deadlines set by the plugin options', () => {
  it('gives up a commit and an export after the short deadlines it is handed', async () => {
    const codes = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* memoryStore
          yield* store.upsertElement('draft', {room: ROOM, elementId: 'kept', data: {}, version: 1})
          const commit = yield* Effect.forkChild(commitDraft(store, ROOM, 40), {startImmediately: true})
          yield* TestClock.adjust(40)
          const committed = commit.pollUnsafe()
          const exporting = yield* Effect.forkChild(exportPng(store, ROOM, 'live', 30), {
            startImmediately: true,
          })
          yield* TestClock.adjust(30)
          const exported = exporting.pollUnsafe()
          yield* Fiber.interrupt(commit)
          yield* Fiber.interrupt(exporting)
          return [readFailureCode(committed), readFailureCode(exported)]
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    )
    expect(codes).toEqual(['COMMIT_TIMEOUT', 'EXPORT_TIMEOUT'])
  })
})
