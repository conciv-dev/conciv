import {batch, createEffect, createMemo, createSignal, getOwner, onCleanup, untrack} from 'solid-js'
import type {SessionRef} from '@conciv/plugin/experimental'
import {same} from '../persistence/equality'
import {
  createLocatedWritesState,
  selectLocatedDraining,
  selectLocatedSessionBusy,
  selectLocatedWaitingKeys,
  transitionLocatedWrites,
  type LocatedWritesEvent,
} from './located-machine'

export function createLocatedWrites() {
  const [writesState, setWritesState] = createSignal(createLocatedWritesState())
  const refs = new Map<string, SessionRef>()
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const waiting = createMemo(() => selectLocatedWaitingKeys(writesState()), [], {equals: same})

  const dispatch = (event: LocatedWritesEvent) => {
    const next = transitionLocatedWrites(untrack(writesState), event)

    setWritesState(next.state)
    next.effects.forEach((effect) => {
      if (effect.type === 'run')
        return void Promise.try(effect.run).catch((cause: unknown) => console.error('[plugin]', cause))

      if (effect.type === 'drain')
        return batch(() => {
          while (selectLocatedDraining(untrack(writesState), effect.key))
            dispatch({type: 'drain.next', key: effect.key})
        })

      if (effect.type === 'schedule.expire')
        return void timers.set(
          effect.id,
          setTimeout(() => {
            timers.delete(effect.id)
            dispatch({type: 'expire', id: effect.id})
          }, effect.timeoutMs),
        )

      effect.ids.forEach((id) => {
        clearTimeout(timers.get(id))
        timers.delete(id)
      })
    })
  }

  createEffect(() => {
    const keys = waiting()
    Array.from(refs.keys()).forEach((key) => {
      if (!untrack(() => selectLocatedSessionBusy(writesState(), key))) refs.delete(key)
    })
    const ready = keys.filter((key) => refs.get(key)?.location)

    if (ready.length === 0) return
    untrack(() => batch(() => ready.forEach((key) => dispatch({type: 'drain.start', key}))))
  })

  if (getOwner()) onCleanup(() => dispatch({type: 'disposed'}))

  return {
    hold(session: SessionRef, run: () => void) {
      const located = Boolean(untrack(() => session.location))

      if (!located || selectLocatedSessionBusy(untrack(writesState), session.key)) refs.set(session.key, session)
      dispatch({type: 'write', key: session.key, located, run})
    },
    pending: (key: string) => selectLocatedSessionBusy(untrack(writesState), key),
  }
}
