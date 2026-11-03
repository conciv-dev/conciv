import {mergeProps, splitProps, type ComponentProps} from 'solid-js'
import {Menu as Ark, useMenu as useArkMenu, type UseMenuProps, type UseMenuReturn} from '@ark-ui/solid/menu'
import {LIST_PANEL, LIST_PANEL_GROUP_LABEL, LIST_PANEL_ITEM} from './list-panel.js'

const CONTENT = `hidden data-[state=open]:block data-[state=open]:anim-combo ${LIST_PANEL}`
const ITEM = `${LIST_PANEL_ITEM} data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`
const ITEM_GROUP_LABEL = LIST_PANEL_GROUP_LABEL
const SEPARATOR = 'h-px my-1 bg-chat-line'
const POSITIONING = {strategy: 'fixed', placement: 'bottom-start', gutter: 4} as const

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return <Ark.Root positioning={{...POSITIONING, ...local.positioning}} {...rest} />
}

export type MenuMachine = UseMenuReturn

export function useMenu(props: UseMenuProps = {}): MenuMachine {
  return useArkMenu(
    mergeProps(props, {
      get positioning() {
        return {...POSITIONING, ...props.positioning}
      },
    }),
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
