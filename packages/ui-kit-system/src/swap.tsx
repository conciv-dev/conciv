import {splitProps, type ComponentProps} from 'solid-js'
import {Swap as Ark} from '@ark-ui/solid/swap'

// Crossfade/scale between two states (e.g. Copy → Check). Each Indicator animates on its own
// data-state (Zag tracks animationend), so the swap is keyframe-driven, never a transition.
const INDICATOR = 'inline-flex data-[state=open]:anim-swap-in data-[state=closed]:anim-swap-out'

function Indicator(props: ComponentProps<typeof Ark.Indicator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Indicator {...rest} class={`${INDICATOR}  ${local.class ?? ''}`} />
}

export const Swap = Object.assign({}, Ark, {Indicator})
