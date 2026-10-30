import {splitProps, type ComponentProps} from 'solid-js'
import {SegmentGroup as Ark} from '@ark-ui/solid/segment-group'

const ROOT =
  'relative inline-flex items-center gap-0.5 p-0.5 rounded-chat-pill bg-chat-fill-strong [border:1px_solid_var(--chat-line)] data-[disabled]:opacity-50'
const ITEM =
  'relative z-1 inline-flex items-center gap-1.5 py-1 px-2.5 text-[0.8125rem] font-chat text-chat-text-3 cursor-pointer select-none trans-btn hover:text-chat-text-2 data-[state=checked]:text-chat-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem] rounded-chat-pill'
const INDICATOR =
  'absolute rounded-chat-pill bg-chat-accent-soft [width:var(--width)] [height:var(--height)] [left:var(--left)] [top:var(--top)] [--transition-duration:240ms] [--transition-timing-function:var(--chat-ease-expo)] motion-reduce:[--transition-duration:0ms]'
const LABEL = 'text-[0.8125rem] font-chat text-chat-text-2'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Root {...rest} class={`${ROOT}  ${local.class ?? ''}`} />
}

function Item(props: ComponentProps<typeof Ark.Item>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Item {...rest} class={`${ITEM}  ${local.class ?? ''}`} />
}

function Indicator(props: ComponentProps<typeof Ark.Indicator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Indicator {...rest} class={`${INDICATOR}  ${local.class ?? ''}`} />
}

function Label(props: ComponentProps<typeof Ark.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Label {...rest} class={`${LABEL}  ${local.class ?? ''}`} />
}

export const SegmentGroup = Object.assign({}, Ark, {Root, Item, Indicator, Label})
