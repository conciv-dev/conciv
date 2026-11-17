import {activeElementIn} from '@conciv/ui-kit-system'
import {createEffect, createMemo, createSignal, on, onCleanup, onMount, type Component} from 'solid-js'

type Layer = {isOpen: () => boolean; hides: () => boolean}

export type LayerStack = {
  register: (isOpen: () => boolean, hides?: boolean) => () => void
  anyOpen: () => boolean
  anyHiding: () => boolean
  track: <P extends {open?: boolean; layer?: 'page' | 'inline'}>(Inner: Component<P>) => Component<P>
}

function focusIsLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body
}

export function makeLayerStack(rootNode: Node): LayerStack {
  const [stack, setStack] = createSignal<Layer[]>([])
  const anyHiding = createMemo(() => stack().some((layer) => layer.hides() && layer.isOpen()))
  const focusBeforeHiding = createMemo<Element | null>(
    (previous) => (anyHiding() ? (previous ?? activeElementIn(rootNode)) : null),
    null,
  )
  createEffect(
    on(
      focusBeforeHiding,
      (current, previous) => {
        if (current !== null || !(previous instanceof HTMLElement) || !previous.isConnected || !focusIsLost()) return
        previous.focus()
      },
      {defer: true},
    ),
  )
  const remove = (layer: Layer) => setStack((prev) => prev.filter((entry) => entry !== layer))
  const push = (layer: Layer) => setStack((prev) => [...prev, layer])
  return {
    register(isOpen, hides = true) {
      const layer: Layer = {isOpen, hides: () => hides}
      push(layer)
      return () => remove(layer)
    },
    anyOpen: () => stack().some((layer) => layer.isOpen()),
    anyHiding,
    track(Inner) {
      return (props) => {
        const layer: Layer = {isOpen: () => props.open ?? false, hides: () => props.layer !== 'inline'}
        onMount(() => push(layer))
        onCleanup(() => remove(layer))
        return Inner(props)
      }
    },
  }
}
