import {splitProps, type ComponentProps} from 'solid-js'
import {Swap as Ark} from '@ark-ui/solid/swap'

// Crossfade/scale between two states (e.g. Copy → Check). Both indicators stack in one grid cell
// (Ark sets grid-area); the active rests visible and the inactive fades/scales out. We key off Ark's
// `hidden` attribute (`!present`), NOT data-state: Ark's useSwap forces skipAnimationOnMount, so
// data-state is `undefined` on first mount — keying on `data-[state=open]` would leave the active
// indicator at opacity 0 until the first toggle. `hidden` is set correctly from mount; we override its
// UA `display:none` (class+attr beats the UA rule) so the crossfade can still animate opacity.
const INDICATOR =
  'inline-flex [transition:opacity_150ms_ease,scale_150ms_ease] [&[hidden]]:opacity-0 [&[hidden]]:[scale:0.6] [&[hidden]]:[display:inline-flex]'

function Indicator(props: ComponentProps<typeof Ark.Indicator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Indicator {...rest} class={`${INDICATOR}  ${local.class ?? ''}`} />
}

export const Swap = Object.assign({}, Ark, {Indicator})
