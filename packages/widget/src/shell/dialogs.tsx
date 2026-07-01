import {createSignal, onCleanup, onMount, type Component} from 'solid-js'

// Open-overlay bookkeeping. A module-level signal shared across the dynamic-import boundary, exactly
// like react-grab/picking.ts — the shell imports `anyOpen` and reads it; that read is the wire.
type Layer = {isOpen: () => boolean}

const [stack, setStack] = createSignal<Layer[]>([])
const pushLayer = (layer: Layer): void => void setStack([...stack(), layer])
const removeLayer = (layer: Layer): void => void setStack(stack().filter((entry) => entry !== layer))

// Registers an open-state accessor as a suppression layer for overlays the shell does not render
// itself (an extension's own popover). Returns a disposer that removes the layer.
export function registerSuppressor(isOpen: () => boolean): () => void {
  const layer: Layer = {isOpen}
  pushLayer(layer)
  return () => removeLayer(layer)
}

// Plain derived accessors (not module-level memos, which would be root-less + never disposed): read
// inside the shell's reactive scope they track stack() and each layer's isOpen() correctly.
export const anyOpen = (): boolean => stack().some((layer) => layer.isOpen())
export const topOpen = (): Layer | undefined => stack().findLast((layer) => layer.isOpen())

// Wraps a controlled overlay so the host knows when it is open. A signal-array (not a store) lets the
// layer be removed by reference, so no per-layer id is needed. Reads props.open only — controlled.
export function track<P extends {open?: boolean}>(Inner: Component<P>): Component<P> {
  return (props) => {
    const isOpen = () => props.open ?? false
    const layer: Layer = {isOpen}
    onMount(() => pushLayer(layer))
    onCleanup(() => removeLayer(layer))
    return <Inner {...props} />
  }
}
