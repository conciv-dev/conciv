import {createComputed, getOwner, onCleanup, untrack, type Accessor} from 'solid-js'
import {
  createLinkCheckState,
  selectLinkCheckActive,
  selectLinkCheckDisposed,
  transitionLinkCheck,
  type LinkCheckEffect,
  type LinkCheckEvent,
} from './link-check-machine'

export function createLinkCheck(active: Accessor<boolean>, check: (href: string) => boolean | Promise<boolean>) {
  const machine = {state: createLinkCheckState(untrack(active))}
  const waiters = new Map<number, PromiseWithResolvers<boolean>>()

  const dispatch = (event: LinkCheckEvent) => {
    const next = transitionLinkCheck(machine.state, event)

    machine.state = next.state
    next.effects.forEach(run)

    return next.id
  }

  const run = (effect: LinkCheckEffect) => {
    if (effect.type === 'schedule.wake') return queueMicrotask(() => dispatch({type: 'wake', epoch: effect.epoch}))

    if (effect.type === 'check')
      return answer(effect.id, new Promise<boolean>((resolve) => resolve(untrack(() => check(effect.href)))))
    const waiter = waiters.get(effect.id)
    waiters.delete(effect.id)

    if (effect.type === 'resolve') return waiter?.resolve(effect.value)
    waiter?.reject(effect.cause)
  }

  const answer = (id: number, result: Promise<boolean>) =>
    void result.then(
      (found) => dispatch({type: 'settled', id, found}),
      (cause: unknown) => dispatch({type: 'failed', id, cause}),
    )

  const wait = (id: number | undefined) => {
    if (id === undefined) return false
    const waiter = Promise.withResolvers<boolean>()
    waiters.set(id, waiter)

    return waiter.promise
  }

  createComputed(() => {
    const next = active()

    untrack(() => dispatch({type: 'sync', active: next}))
  })

  if (getOwner()) onCleanup(() => dispatch({type: 'disposed'}))

  return (href: string): boolean | Promise<boolean> => {
    if (selectLinkCheckDisposed(machine.state)) return false

    if (!selectLinkCheckActive(machine.state)) return wait(dispatch({type: 'defer', href}))
    const result = untrack(() => check(href))

    if (result === true || result === false) return result
    const id = dispatch({type: 'start', href})
    const pending = wait(id)

    if (id !== undefined) answer(id, result)

    return pending
  }
}
