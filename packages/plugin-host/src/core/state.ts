export * as State from './state.js'

import {Cause, Context, Effect, Exit, Fiber, Scope} from 'effect'

type TransformCallback<Editor> = (editor: Editor) => void
export type MakeEditor<State, Editor> = (state: State) => Editor

export interface Registration {
  readonly dispose: Effect.Effect<void>
}

export type Transform<Editor> = (
  transform: TransformCallback<Editor>,
) => Effect.Effect<Registration, never, Scope.Scope>

export type Reload = () => Effect.Effect<void>

export interface Transformable<Editor> {
  readonly transform: Transform<Editor>
  readonly reload: Reload
}

export interface Failure {
  readonly state: string
  readonly cause: unknown
}

type GroupedRegistration = {
  readonly remove: () => boolean
  readonly notify: Effect.Effect<void>
}

type RegistrationGroup = {
  failed: boolean
  readonly registrations: Set<GroupedRegistration>
  readonly report: (failure: Failure, refresh: Effect.Effect<void>) => void
}

const CurrentGroup = Context.Reference<RegistrationGroup | undefined>('@opencode/State/CurrentGroup', {
  defaultValue: () => undefined,
})

export function group(report: RegistrationGroup['report']) {
  const group: RegistrationGroup = {failed: false, registrations: new Set(), report}
  return <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provideService(effect, CurrentGroup, group)
}

function disable(group: RegistrationGroup, failure: Failure) {
  if (group.failed) return
  group.failed = true
  const notifications = new Set<Effect.Effect<void>>()
  for (const registration of group.registrations) {
    registration.remove()
    notifications.add(registration.notify)
  }
  group.report(
    failure,
    Effect.forEach(notifications, (notify) => notify, {discard: true}),
  )
}

type Batch = {
  active: boolean
  readonly shutdown: boolean
  readonly notifications: Set<Effect.Effect<void>>
}

const CurrentBatch = Context.Reference<Batch | undefined>('@opencode/State/CurrentBatch', {
  defaultValue: () => undefined,
})
export function batch<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return run(effect, false)
}

export function shutdown<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return run(effect, true)
}

function run<A, E, R>(effect: Effect.Effect<A, E, R>, shutdown: boolean) {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const current = yield* CurrentBatch
      if (current?.active && !shutdown) return yield* restore(effect)
      const batch: Batch = {active: true, shutdown, notifications: new Set()}
      const exit = yield* restore(effect.pipe(Effect.provideService(CurrentBatch, batch))).pipe(Effect.exit)
      batch.active = false
      const notifications = yield* Effect.forEach(batch.notifications, (notify) => restore(notify).pipe(Effect.exit))
      yield* Exit.asVoidAll([exit, ...notifications])
      return yield* exit
    }),
  )
}

export function reconcile(
  root: Scope.Scope,
  fork: (effect: Effect.Effect<void>) => Fiber.Fiber<void>,
  work: () => Effect.Effect<void>,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const exit = yield* Fiber.await(fork(work()))
    if (Exit.isFailure(exit) && root.state._tag === 'Closed' && Cause.hasInterruptsOnly(exit.cause)) return
    yield* exit
  })
}

export function changes<State>(
  project: (state: State) => unknown,
  notify: (state: State) => Effect.Effect<void>,
): (state: State) => Effect.Effect<void> {
  let published: string | undefined
  return (state) =>
    Effect.suspend(() => {
      const next = JSON.stringify(project(state)) ?? ''
      if (next === published) return Effect.void
      published = next
      return notify(state)
    })
}

export const inherit = Effect.fnUntraced(function* () {
  const batch = yield* CurrentBatch
  return <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provideService(effect, CurrentBatch, batch)
})

export interface Options<State, Editor> {
  readonly name?: string
  readonly initial: () => State
  readonly editor: MakeEditor<State, Editor>
  readonly notify?: (state: State) => Effect.Effect<void>
}

export interface Interface<State, Editor> extends Transformable<Editor> {
  readonly get: () => State
  readonly invalidate: () => void
  readonly revision: () => number
}

export function create<State, Editor>(options: Options<State, Editor>): Interface<State, Editor> {
  let state = options.initial()
  const transforms = new Set<{run: TransformCallback<Editor>; group: RegistrationGroup | undefined}>()
  let dirty = false
  let closed = false
  let version = 0

  const invalidate = () => {
    dirty = true
    version++
  }

  const get = () => {
    if (closed || !dirty) return state
    while (true) {
      const started = version
      const next = options.initial()
      const editor = options.editor(next)
      for (const transform of transforms) {
        try {
          transform.run(editor)
        } catch (cause) {
          if (!transform.group) throw cause
          disable(transform.group, {state: options.name ?? 'anonymous', cause})
        }
        if (version !== started) break
      }
      if (version !== started) continue
      state = next
      dirty = false
      return state
    }
  }

  const notify: Effect.Effect<void> = Effect.gen(function* () {
    if (closed) return
    const value = get()
    if (options.notify) yield* options.notify(value)
  }).pipe(Effect.withSpan('State.notify'))

  const changed = Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      if (closed) return
      invalidate()
      const batch = yield* CurrentBatch
      if (batch?.active) {
        if (batch.shutdown) {
          closed = true
          return
        }
        batch.notifications.add(notify)
        return
      }
      yield* restore(notify)
    }),
  )

  return {
    get,
    invalidate,
    revision: () => version,
    transform: Effect.fn('State.transform')(function* (update) {
      yield* Effect.annotateCurrentSpan('state', options.name ?? 'anonymous')
      const scope = yield* Scope.Scope
      const group = yield* CurrentGroup
      if (group?.failed) return {dispose: Effect.void}
      return yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const transform = {run: update, group}
          const registration: GroupedRegistration = {
            remove: () => {
              if (!transforms.delete(transform)) return false
              group?.registrations.delete(registration)
              invalidate()
              return true
            },
            notify: changed,
          }
          const dispose = Effect.uninterruptible(Effect.suspend(() => (registration.remove() ? changed : Effect.void)))
          transforms.add(transform)
          group?.registrations.add(registration)
          yield* Scope.addFinalizer(scope, dispose)
          yield* changed
          return {dispose}
        }),
      )
    }),
    reload: () => changed,
  }
}
