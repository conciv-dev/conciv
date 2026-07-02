import {splitProps, type ComponentProps} from 'solid-js'
import {Swap as Ark} from '@ark-ui/solid/swap'

const INDICATOR =
  'inline-flex [transition:opacity_150ms_ease,scale_150ms_ease] [&[hidden]]:opacity-0 [&[hidden]]:[scale:0.6] [&[hidden]]:[display:inline-flex]'

function Indicator(props: ComponentProps<typeof Ark.Indicator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Indicator {...rest} class={`${INDICATOR}  ${local.class ?? ''}`} />
}

export const Swap = Object.assign({}, Ark, {Indicator})
