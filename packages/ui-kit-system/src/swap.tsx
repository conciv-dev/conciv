import {splitProps, type ComponentProps} from 'solid-js'
import {Swap as Ark} from '@ark-ui/solid/swap'

// Crossfade/scale between two states (e.g. Copy → Check). Both indicators stack in one grid cell
// (Ark sets grid-area); the inactive one rests hidden (opacity 0) and the active fades/scales in via a
// data-state transition. A transition (not a one-shot keyframe) guarantees the rest state — Swap never
// unmounts, so it has no animationend contract to honor (unlike Collapsible/Presence).
const INDICATOR =
  'inline-flex opacity-0 [scale:0.6] [transition:opacity_150ms_ease,scale_150ms_ease] data-[state=open]:opacity-100 data-[state=open]:[scale:1]'

function Indicator(props: ComponentProps<typeof Ark.Indicator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Indicator {...rest} class={`${INDICATOR}  ${local.class ?? ''}`} />
}

export const Swap = Object.assign({}, Ark, {Indicator})
