import {type JSX, onMount, Show, splitProps} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {BinaryEffectHost} from './mascot-binary.js'
import {MascotProvider} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import {composeRefs, type MascotProps, mergeStyle} from './mascot-props.js'
import {installStageSize} from './mascot-stage-sheet.js'
import {createMascotHost} from './use-mascot.js'

export function MascotRoot(props: MascotProps): JSX.Element {
  const host = createMascotHost(props)
  const [local, rest] = splitProps(props, [
    'state',
    'working',
    'follow',
    'activity',
    'curve',
    'initialSkin',
    'style',
    'ref',
    'children',
  ])
  let element: HTMLSpanElement | undefined
  onMount(() => {
    if (element !== undefined) installStageSize(element)
  })
  return (
    <MascotProvider value={host.context}>
      <Dynamic
        component="span"
        aria-hidden="true"
        {...rest}
        data-scope="mascot"
        data-part="root"
        style={mergeStyle(host.rootProps.style, local.style)}
        ref={composeRefs((node) => {
          element = node
          host.rootProps.ref(node)
        }, local.ref)}
      >
        {local.children}
        <Show when={!host.slots.head}>
          <MascotLayer layer="head" />
        </Show>
        <Show when={!host.slots.antenna}>
          <MascotLayer layer="antenna" />
        </Show>
        <Show when={!host.slots.eyes}>
          <MascotLayer layer="eyes" />
        </Show>
        <Show when={host.slots.effects === 0}>
          <BinaryEffectHost curve={local.curve} />
        </Show>
      </Dynamic>
    </MascotProvider>
  )
}
