import {createContext, createSignal, useContext} from 'solid-js'

type Layer = {isOpen: () => boolean; hides: () => boolean}

export type LayerStack = {
  register: (isOpen: () => boolean, hides?: boolean) => () => void
  anyOpen: () => boolean
  anyHiding: () => boolean
}

export function makeLayerStack(): LayerStack {
  const [stack, setStack] = createSignal<Layer[]>([])
  const remove = (layer: Layer) => setStack((prev) => prev.filter((entry) => entry !== layer))
  const push = (layer: Layer) => setStack((prev) => [...prev, layer])
  return {
    register(isOpen, hides = true) {
      const layer: Layer = {isOpen, hides: () => hides}
      push(layer)
      return () => remove(layer)
    },
    anyOpen: () => stack().some((layer) => layer.isOpen()),
    anyHiding: () => stack().some((layer) => layer.hides() && layer.isOpen()),
  }
}

export const LayersContext = createContext<LayerStack>()

export function useLayers(): LayerStack {
  const value = useContext(LayersContext)

  if (!value) throw new Error('useLayers called outside the layers provider')

  return value
}
