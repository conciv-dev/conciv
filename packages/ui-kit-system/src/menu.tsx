import {splitProps, type ComponentProps} from 'solid-js'
import {Menu as Ark} from '@ark-ui/solid/menu'
import {nativeFocusPart} from './native-focus.js'
import {LIST_PANEL, LIST_PANEL_GROUP_LABEL, LIST_PANEL_ITEM} from './list-panel.js'

const POSITIONER = 'flex flex-col'
const CONTENT = `hidden data-[state=open]:flex flex-col min-h-0 data-[state=open]:anim-combo ${LIST_PANEL}`
const ITEM = `${LIST_PANEL_ITEM} data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`
const ITEM_GROUP_LABEL = LIST_PANEL_GROUP_LABEL
const SEPARATOR = 'h-px my-1 border-0 bg-chat-line'

const Trigger = nativeFocusPart(Ark.Trigger, 'button')

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return (
    <Ark.Root
      positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 4, fitViewport: true, ...local.positioning}}
      {...rest}
    />
  )
}

function Positioner(props: ComponentProps<typeof Ark.Positioner>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Positioner {...rest} class={[POSITIONER, local.class].filter(Boolean).join(' ')} />
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={[CONTENT, local.class].filter(Boolean).join(' ')} />
}

function Item(props: ComponentProps<typeof Ark.Item>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Item {...rest} class={[ITEM, local.class].filter(Boolean).join(' ')} />
}

function ItemGroupLabel(props: ComponentProps<typeof Ark.ItemGroupLabel>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.ItemGroupLabel {...rest} class={[ITEM_GROUP_LABEL, local.class].filter(Boolean).join(' ')} />
}

function Separator(props: ComponentProps<typeof Ark.Separator>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Separator {...rest} class={[SEPARATOR, local.class].filter(Boolean).join(' ')} />
}

export const Menu = Object.assign({}, Ark, {Root, Trigger, Positioner, Content, Item, ItemGroupLabel, Separator})
