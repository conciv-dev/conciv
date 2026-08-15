import {type JSX, Show, splitProps} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {BinaryEffectHost} from './mascot-binary.js'
import {MascotProvider} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import {composeRefs, defaultRootSize, type MascotProps, mergeStyle} from './mascot-props.js'
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
  const rootStyle = () => ({...defaultRootSize(props.class, local.style), ...host.rootProps.style})
  return (
    <MascotProvider value={host.context}>
      <Dynamic
        component="div"
        aria-hidden="true"
        {...rest}
        data-scope="mascot"
        data-part="root"
        style={mergeStyle(rootStyle(), local.style)}
        ref={composeRefs(host.rootProps.ref, local.ref)}
      >
        {local.children}
        <Show when={host.slots.head === 0}>
          <MascotLayer layer="head" />
        </Show>
        <Show when={host.slots.antenna === 0}>
          <MascotLayer layer="antenna" />
        </Show>
        <Show when={host.slots.eyes === 0}>
          <MascotLayer layer="eyes" />
        </Show>
        <Show when={host.slots.effects === 0}>
          <BinaryEffectHost curve={local.curve} />
        </Show>
      </Dynamic>
    </MascotProvider>
  )
}
