import {splitProps, type ComponentProps} from 'solid-js'
import {Listbox as Ark} from '@ark-ui/solid/listbox'

const CONTENT = 'flex flex-col outline-none'
const ITEM =
  'flex items-center gap-3 py-2 px-2.5 rounded-chat-surface-sm cursor-pointer select-none outline-none trans-bg hover:bg-chat-fill data-[highlighted]:bg-chat-fill data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`} />
}

function Item(props: ComponentProps<typeof Ark.Item>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Item {...rest} class={`${ITEM}  ${local.class ?? ''}`} />
}

export const Listbox = Object.assign({}, Ark, {Content, Item})
