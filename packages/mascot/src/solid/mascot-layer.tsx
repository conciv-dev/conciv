import {createMemo, type JSX, onCleanup, onMount, splitProps} from 'solid-js'
import {type MascotPartName, useMascotContext} from './mascot-context.js'
import {composeRefs, type MascotLayerProps, mergeStyle} from './mascot-props.js'

export type MascotLayerHostProps = MascotLayerProps & {layer: MascotPartName}

const LAYER_DEPTH: Record<MascotPartName, string> = {head: '0', antenna: '1', eyes: '2'}

const depthStyle = (part: MascotPartName, style: Record<string, string>): Record<string, string> => ({
  'z-index': LAYER_DEPTH[part],
  ...style,
})

export function MascotLayer(props: MascotLayerHostProps): JSX.Element {
  const context = useMascotContext()
  const [local, rest] = splitProps(props, ['layer', 'style', 'ref'])
  const layer = createMemo(() => context.partProps(local.layer))
  let element: HTMLDivElement | undefined
  onMount(() => layer().ref(element ?? null))
  onCleanup(() => layer().ref(null))
  return (
    <div
      data-scope="mascot"
      data-part={local.layer}
      aria-hidden="true"
      {...rest}
      style={mergeStyle(depthStyle(local.layer, layer().style), local.style)}
      ref={composeRefs((node) => {
        element = node
      }, local.ref)}
    />
  )
}
