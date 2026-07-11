import {createSignal} from 'solid-js'

export const [picking, setPicking] = createSignal(false)

let cancelFn: (() => void) | null = null

export function setCancelPick(fn: (() => void) | null): void {
  cancelFn = fn
}
export function cancelPick(): void {
  cancelFn?.()
}
