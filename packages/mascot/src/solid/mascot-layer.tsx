import {type JSX, onCleanup, onMount, splitProps} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {type MascotPartName, useMascotContext} from './mascot-context.js'
import {composeRefs, LAYER_GEOMETRY_PROPERTIES, type MascotLayerProps, mergeStyle} from './mascot-props.js'

export type MascotLayerHostProps = MascotLayerProps & {layer: MascotPartName}

export function MascotLayer(props: MascotLayerHostProps): JSX.Element {
  const context = useMascotContext()
  const [local, rest] = splitProps(props, ['layer', 'style', 'ref'])
  const layer = () => context.partProps(local.layer)
  let element: HTMLDivElement | undefined
  onMount(() => layer().ref(element ?? null))
  onCleanup(() => {
    if (element !== undefined) layer().release(element)
  })
  return (
    <Dynamic
      component="div"
      aria-hidden="true"
      {...rest}
      data-scope="mascot"
      data-part={local.layer}
      style={mergeStyle(layer().style, local.style, LAYER_GEOMETRY_PROPERTIES)}
      ref={composeRefs((node) => {
        element = node
      }, local.ref)}
    />
  )
}
