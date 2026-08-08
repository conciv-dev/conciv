import {Listbox as Ark} from '@ark-ui/solid/listbox'
import {LIST_PANEL_GROUP_LABEL, LIST_PANEL_ITEM} from './list-panel.js'
import {styledPart} from './styled-part.js'

const CONTENT = 'flex flex-col outline-none'
const ITEM = `${LIST_PANEL_ITEM} flex-col items-start gap-0.5 data-[highlighted]:bg-pw-fill-strong data-[highlighted]:text-pw-text aria-selected:bg-pw-fill-strong aria-selected:text-pw-text data-[disabled]:opacity-50 data-[disabled]:cursor-default`
const ITEM_TEXT = 'w-full truncate font-medium text-pw-text'
const ITEM_DESCRIPTION = 'w-full line-clamp-2 text-[0.75rem] leading-tight text-pw-text-3'

const Content = styledPart(Ark.Content, CONTENT)
const Item = styledPart(Ark.Item, ITEM)
const ItemText = styledPart(Ark.ItemText, ITEM_TEXT)
const ItemGroupLabel = styledPart(Ark.ItemGroupLabel, LIST_PANEL_GROUP_LABEL)

export const Listbox = Object.assign({}, Ark, {Content, Item, ItemText, ItemGroupLabel})

export const LISTBOX_ITEM_DESCRIPTION = ITEM_DESCRIPTION
