import {splitProps, type ComponentProps} from 'solid-js'
import {Menu as Ark} from '@ark-ui/solid/menu'

const CONTENT =
  'hidden data-[state=open]:block data-[state=open]:anim-combo z-[2147483647] min-w-44 rounded-pw-md bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg p-1 focus-visible:outline-none'
const ITEM =
  'flex items-center gap-2 min-h-8 py-1.5 px-2.5 rounded-pw-sm text-[0.8125rem] text-pw-text-2 cursor-pointer select-none outline-none data-[highlighted]:bg-pw-fill-strong data-[highlighted]:text-pw-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const ITEM_GROUP_LABEL = 'py-1.5 px-2.5 text-[0.6875rem] font-pw text-pw-text-3 uppercase tracking-wide'
const SEPARATOR = 'h-px my-1 bg-pw-line'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return (
    <Ark.Root positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 4, ...local.positioning}} {...rest} />
  )
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

function Separator(props: ComponentProps<typeof Ark.Separator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Separator {...rest} class={`${SEPARATOR}  ${local.class ?? ''}`} />
}

export const Menu = Object.assign({}, Ark, {Root, Content, Item, ItemGroupLabel, Separator})
