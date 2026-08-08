import {splitProps, type ComponentProps} from 'solid-js'
import {Menu as Ark} from '@ark-ui/solid/menu'
import {LIST_PANEL, LIST_PANEL_GROUP_LABEL, LIST_PANEL_ITEM} from './list-panel.js'
import {styledPart} from './styled-part.js'

const CONTENT = `hidden data-[state=open]:block data-[state=open]:anim-combo ${LIST_PANEL}`
const ITEM = `${LIST_PANEL_ITEM} data-[highlighted]:bg-pw-fill-strong data-[highlighted]:text-pw-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`
const ITEM_GROUP_LABEL = LIST_PANEL_GROUP_LABEL
const SEPARATOR = 'h-px my-1 bg-pw-line'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return (
    <Ark.Root positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 4, ...local.positioning}} {...rest} />
  )
}

const Content = styledPart(Ark.Content, CONTENT)
const Item = styledPart(Ark.Item, ITEM)
const ItemGroupLabel = styledPart(Ark.ItemGroupLabel, ITEM_GROUP_LABEL)
const Separator = styledPart(Ark.Separator, SEPARATOR)

export const Menu = Object.assign({}, Ark, {Root, Content, Item, ItemGroupLabel, Separator})
