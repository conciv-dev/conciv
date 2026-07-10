import {createSignal} from 'solid-js'

type Layer = {isOpen: () => boolean; hides: boolean}

export type LayerStack = {
  register: (isOpen: () => boolean, hides?: boolean) => () => void
  anyOpen: () => boolean
  anyHiding: () => boolean
}

export function makeLayerStack(): LayerStack {
  const [stack, setStack] = createSignal<Layer[]>([])
  const remove = (layer: Layer) => setStack((prev) => prev.filter((entry) => entry !== layer))
  return {
    register(isOpen, hides = true) {
      const layer: Layer = {isOpen, hides}
      setStack((prev) => [...prev, layer])
      return () => remove(layer)
    },
    anyOpen: () => stack().some((layer) => layer.isOpen()),
    anyHiding: () => stack().some((layer) => layer.hides && layer.isOpen()),
  }
}
