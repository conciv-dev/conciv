import {createEffect, createRoot} from 'solid-js'
import {getReactGrabAdapter} from './react-grab/adapter.js'
import {picking, cancelPick} from './react-grab/picking.js'
import type {Grab, GrabApi} from '@conciv/grab'

let pendingResolve: ((grab: Grab | null) => void) | null = null

createRoot(() => {
  createEffect(() => {
    if (picking()) return
    const resolve = pendingResolve
    if (!resolve) return
    pendingResolve = null
    resolve(null)
  })
})

function startPick(mode: 'activate' | 'comment'): Promise<Grab | null> {
  return new Promise((resolve) => {
    pendingResolve?.(null)
    pendingResolve = resolve
    void getReactGrabAdapter().then((adapter) =>
      adapter[mode]((grab) => {
        if (pendingResolve !== resolve) return
        pendingResolve = null
        resolve(grab)
      }),
    )
  })
}

export const grabApi: Omit<GrabApi, 'stage' | 'staged' | 'clear'> = {
  pick: () => startPick('activate'),
  comment: () => startPick('comment'),
  cancel: cancelPick,
  isActive: picking,
}
