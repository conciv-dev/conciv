import {createSignal, onCleanup, onMount, type Component} from 'solid-js'

type Layer = {isOpen: () => boolean; hides: boolean}

export type LayerStack = {
  register: (isOpen: () => boolean, hides?: boolean) => () => void
  anyOpen: () => boolean
  anyHiding: () => boolean
  track: <P extends {open?: boolean; layer?: 'page' | 'inline'}>(Inner: Component<P>) => Component<P>
}

export function makeLayerStack(): LayerStack {
  const [stack, setStack] = createSignal<Layer[]>([])
  const remove = (layer: Layer) => setStack((prev) => prev.filter((entry) => entry !== layer))
  const push = (layer: Layer) => setStack((prev) => [...prev, layer])
  return {
    register(isOpen, hides = true) {
      const layer: Layer = {isOpen, hides}
      push(layer)
      return () => remove(layer)
    },
    anyOpen: () => stack().some((layer) => layer.isOpen()),
    anyHiding: () => stack().some((layer) => layer.hides && layer.isOpen()),
    track(Inner) {
      return (props) => {
        const layer: Layer = {isOpen: () => props.open ?? false, hides: props.layer !== 'inline'}
        onMount(() => push(layer))
        onCleanup(() => remove(layer))
        return Inner(props)
      }
    },
  }
}
