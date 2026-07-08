import {createSignal, onCleanup, onMount, type Component} from 'solid-js'

type Layer = {isOpen: () => boolean; hides: boolean}

const [stack, setStack] = createSignal<Layer[]>([])
const pushLayer = (layer: Layer): void => void setStack([...stack(), layer])
const removeLayer = (layer: Layer): void => void setStack(stack().filter((entry) => entry !== layer))

export function registerSuppressor(isOpen: () => boolean, hides = true): () => void {
  const layer: Layer = {isOpen, hides}
  pushLayer(layer)
  return () => removeLayer(layer)
}

export const anyOpen = (): boolean => stack().some((layer) => layer.isOpen())
export const anyHiding = (): boolean => stack().some((layer) => layer.hides && layer.isOpen())
export const topOpen = (): Layer | undefined => stack().findLast((layer) => layer.isOpen())

export function track<P extends {open?: boolean}>(Inner: Component<P>): Component<P> {
  return (props) => {
    const isOpen = () => props.open ?? false
    const layer: Layer = {isOpen, hides: true}
    onMount(() => pushLayer(layer))
    onCleanup(() => removeLayer(layer))
    return <Inner {...props} />
  }
}
