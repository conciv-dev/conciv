import {splitProps, type ComponentProps} from 'solid-js'
import {Select as Ark} from '@ark-ui/solid/select'

const TRIGGER =
  'flex items-center justify-between gap-2 w-full min-h-9 py-2 px-2.5 rounded-chat-surface-sm bg-chat-fill text-chat-text text-[0.8125rem] font-chat [border-width:1px] [border-style:solid] border-chat-line cursor-pointer trans-border focus-ring data-[state=open]:border-chat-accent data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const CONTENT =
  'hidden data-[state=open]:flex data-[state=open]:anim-combo flex-col gap-0.5 z-[2147483647] min-w-[var(--reference-width)] max-h-60 overflow-y-auto rounded-chat-surface-md bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg p-1 focus-visible:outline-none'
const ITEM =
  'flex items-center justify-between gap-2 min-h-8 py-1.5 px-2.5 rounded-chat-surface-sm text-[0.8125rem] text-chat-text-2 cursor-pointer select-none outline-none data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[state=checked]:text-chat-accent data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const ITEM_GROUP_LABEL = 'py-1.5 px-2.5 text-[0.6875rem] font-chat text-chat-text-3 uppercase tracking-wide'
const LABEL = 'text-[0.75rem] text-chat-text-2 font-chat'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return (
    <Ark.Root positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 4, ...local.positioning}} {...rest} />
  )
}

function Trigger(props: ComponentProps<typeof Ark.Trigger>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Trigger {...rest} class={`${TRIGGER}  ${local.class ?? ''}`} />
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`} />
}

function Item(props: ComponentProps<typeof Ark.Item>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Item {...rest} class={`${ITEM}  ${local.class ?? ''}`} />
}

function ItemGroupLabel(props: ComponentProps<typeof Ark.ItemGroupLabel>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.ItemGroupLabel {...rest} class={`${ITEM_GROUP_LABEL}  ${local.class ?? ''}`} />
}

function Label(props: ComponentProps<typeof Ark.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Label {...rest} class={`${LABEL}  ${local.class ?? ''}`} />
}

export const Select = Object.assign({}, Ark, {Root, Trigger, Content, Item, ItemGroupLabel, Label})
export {createListCollection} from '@ark-ui/solid/select'
