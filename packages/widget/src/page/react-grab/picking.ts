import {createSignal} from 'solid-js'

// Shared element-picker state. The lazy adapter chunk sets it from react-grab's onActivate/
// onDeactivate hooks; the (eager) shell reads it to shrink the open surface to a "Picking…" pill
// and to wire Esc-to-cancel. One module instance is shared across the dynamic-import boundary.
export const [picking, setPicking] = createSignal(false)

let cancelFn: (() => void) | null = null

// The adapter registers how to abort the current pick (react-grab's deactivate); the pill calls it.
export function setCancelPick(fn: (() => void) | null): void {
  cancelFn = fn
}
export function cancelPick(): void {
  cancelFn?.()
}
