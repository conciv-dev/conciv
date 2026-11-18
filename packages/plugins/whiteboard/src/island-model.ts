import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import {Effect, FiberMap, Queue, Ref, Schedule, Schema, SubscriptionRef} from 'effect'
import {isPlainObject, keyBy, pickBy} from 'es-toolkit'
import {z} from 'zod'
import type {ElementRow, JsonValue, PendingRow} from './rows.js'
import {startDrain, transitionDrain, type DrainEffect, type DrainEvent, type DrainState} from './drain-machine.js'

export const RemoveFailed = Schema.TaggedStruct('RemoveFailed', {message: Schema.String})
type RemoveFailed = typeof RemoveFailed.Type

type PendingWork = {
  readonly claim: (row: PendingRow) => Effect.Effect<boolean, unknown>
  readonly perform: (row: PendingRow) => Effect.Effect<void, unknown>
  readonly remove: (row: PendingRow) => Effect.Effect<void, RemoveFailed>
}

const REMOVE_MAX_WAIT_MS = 10_000

export const makePendingDrain = Effect.fn('whiteboard.pendingDrain')(function* (
  work: PendingWork,
  options: {removeRetryMs: number},
) {
  const start = startDrain()
  const state = yield* SubscriptionRef.make<DrainState>(start.state)
  const inbox = yield* Queue.unbounded<DrainEvent>()
  const rows = yield* FiberMap.make<string>()
  const retry = Schedule.min([Schedule.exponential(options.removeRetryMs), Schedule.spaced(REMOVE_MAX_WAIT_MS)]).pipe(
    Schedule.jittered,
  )
  const offer = (event: DrainEvent) => Queue.offer(inbox, event)

  const run = ({type, attempt, row}: DrainEffect): Effect.Effect<unknown> => {
    const label = `pending ${row.kind} ${row.id}`
    if (type === 'claim')
      return FiberMap.run(
        rows,
        row.id,
        work.claim(row).pipe(
          Effect.catchCause((cause) => Effect.logError(`claiming ${label} failed`, cause).pipe(Effect.as(false))),
          Effect.flatMap((claimed) => offer({type: 'claimed', id: row.id, attempt, claimed})),
        ),
      )
    if (type === 'run')
      return FiberMap.run(
        rows,
        row.id,
        work.perform(row).pipe(
          Effect.catchCause((cause) => Effect.logError(`running ${label} failed`, cause)),
          Effect.andThen(offer({type: 'ran', id: row.id, attempt})),
        ),
      )
    return FiberMap.run(
      rows,
      row.id,
      work.remove(row).pipe(
        Effect.tapError((failure) => Effect.logWarning(`removing ${label} failed; retrying`, failure.message)),
        Effect.retry(retry),
        Effect.andThen(offer({type: 'removed', id: row.id, attempt})),
      ),
    )
  }

  const step = (event: DrainEvent) =>
    SubscriptionRef.modify(state, (current) => {
      const next = transitionDrain(current, event)
      return [next.effects, next.state]
    }).pipe(Effect.flatMap((effects) => Effect.forEach(effects, run, {discard: true})))

  yield* Queue.take(inbox).pipe(Effect.flatMap(step), Effect.forever, Effect.forkScoped)
  yield* Effect.addFinalizer(() => step({type: 'disposed'}))

  return {state, see: (seen: readonly PendingRow[]) => offer({type: 'seen', rows: seen})}
})

export type PendingDrain = Effect.Success<ReturnType<typeof makePendingDrain>>

export type SceneElement = OrderedExcalidrawElement
type Versioned = Pick<SceneElement, 'id' | 'version' | 'versionNonce'>
type Versions = Readonly<Partial<Record<string, number>>>

const sceneElement = z.custom<SceneElement>(isPlainObject)
export const asScene = (data: JsonValue): SceneElement => sceneElement.parse(data)

export const makeSceneVersions = Effect.fn('whiteboard.sceneVersions')(function* () {
  const versions = yield* Ref.make<Versions>({})
  const known = (current: Versions, elementId: string): number => current[elementId] ?? -1

  const seed = (rows: readonly ElementRow[]) =>
    Ref.set(versions, Object.fromEntries(rows.map((row) => [row.elementId, row.version])))

  const acceptRemote = (rows: readonly ElementRow[], shown: readonly Versioned[]) =>
    Ref.modify(versions, (current): [boolean, Versions] => {
      const incoming = keyBy(rows, (row) => row.elementId)
      const showing = keyBy(shown, (element) => element.id)
      const lostTie = (row: ElementRow): boolean => {
        const element = showing[row.elementId]
        return element?.version === row.version && element.versionNonce !== asScene(row.data).versionNonce
      }
      const changed =
        rows.some((row) => known(current, row.elementId) < row.version || lostTie(row)) ||
        Object.keys(current).some((elementId) => incoming[elementId] === undefined)
      return [
        changed,
        {
          ...pickBy(current, (_version, elementId) => incoming[elementId] !== undefined),
          ...Object.fromEntries(
            rows.map((row) => [row.elementId, Math.max(known(current, row.elementId), row.version)]),
          ),
        },
      ]
    })

  const takeLocal = <Element extends Versioned>(elements: readonly Element[]) =>
    Ref.modify(versions, (current): [readonly Element[], Versions] => {
      const changed = elements.filter((element) => known(current, element.id) < element.version)
      return [changed, {...current, ...Object.fromEntries(changed.map((element) => [element.id, element.version]))}]
    })

  return {seed, acceptRemote, takeLocal}
})
