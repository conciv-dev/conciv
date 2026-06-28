import {splitProps, type ComponentProps} from 'solid-js'
import {Tabs as Ark} from '@ark-ui/solid/tabs'

const LIST = 'relative flex items-center gap-1 border-b border-pw-line'
const TRIGGER =
  'relative inline-flex items-center gap-1.5 py-2 px-3 text-[0.8125rem] font-pw text-pw-text-3 cursor-pointer select-none trans-btn hover:text-pw-text-2 data-[selected]:text-pw-text focus-ring disabled:opacity-50 disabled:cursor-not-allowed'
const CONTENT = 'pt-3 focus-visible:outline-none'
const INDICATOR = 'absolute bottom-0 h-0.5 bg-pw-accent [width:var(--width)] [left:var(--left)] trans-btn'

function List(props: ComponentProps<typeof Ark.List>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.List {...rest} class={`${LIST}  ${local.class ?? ''}`} />
}

function Trigger(props: ComponentProps<typeof Ark.Trigger>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Trigger {...rest} class={`${TRIGGER}  ${local.class ?? ''}`} />
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`} />
}

function Indicator(props: ComponentProps<typeof Ark.Indicator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Indicator {...rest} class={`${INDICATOR}  ${local.class ?? ''}`} />
}

export const Tabs = Object.assign({}, Ark, {List, Trigger, Content, Indicator})
