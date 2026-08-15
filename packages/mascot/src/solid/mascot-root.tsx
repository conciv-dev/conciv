import {type JSX, Show, splitProps} from 'solid-js'
import {BinaryEffectHost} from './mascot-binary.js'
import {MascotProvider} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import {composeRefs, type MascotProps, mergeStyle} from './mascot-props.js'
import {createMascotHost} from './use-mascot.js'

const DEFAULT_SIZE: Record<string, string> = {'inline-size': '44px', 'block-size': '44px'}

export function MascotRoot(props: MascotProps): JSX.Element {
  const host = createMascotHost(props)
  const [local, rest] = splitProps(props, [
    'state',
    'working',
    'follow',
    'activity',
    'curve',
    'skin',
    'style',
    'ref',
    'children',
  ])
  return (
    <MascotProvider value={host.context}>
      <div
        data-scope="mascot"
        data-part="root"
        aria-hidden="true"
        {...rest}
        style={mergeStyle({...DEFAULT_SIZE, ...host.rootProps.style}, local.style)}
        ref={composeRefs(host.rootProps.ref, local.ref)}
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
      </div>
    </MascotProvider>
  )
}
