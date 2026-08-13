import {splitProps, type ComponentProps} from 'solid-js'
import {Swap as Ark} from '@ark-ui/solid/swap'

const ROOT = 'inline-grid place-items-center'

const INDICATOR =
  '[grid-area:1/1] inline-flex [transition:opacity_150ms_var(--pw-ease),scale_150ms_var(--pw-ease)] [&[hidden]]:opacity-0 [&[hidden]]:[scale:0.92] [&[hidden]]:[display:inline-flex]'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Root {...rest} class={`${ROOT}  ${local.class ?? ''}`} />
}

function Indicator(props: ComponentProps<typeof Ark.Indicator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Indicator {...rest} class={`${INDICATOR}  ${local.class ?? ''}`} />
}

export const Swap = Object.assign({}, Ark, {Root, Indicator})
