import {splitProps, type ComponentProps} from 'solid-js'
import {Select as Ark} from '@ark-ui/solid/select'
import {styledPart} from './styled-part.js'

const TRIGGER =
  'flex items-center justify-between gap-2 w-full min-h-9 py-2 px-2.5 rounded-pw-sm bg-pw-fill text-pw-text text-[0.8125rem] font-pw [border-width:1px] [border-style:solid] border-pw-line cursor-pointer trans-border focus-ring data-[state=open]:border-pw-accent data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const CONTENT =
  'hidden data-[state=open]:flex data-[state=open]:anim-combo flex-col gap-0.5 z-[2147483647] min-w-[var(--reference-width)] max-h-60 overflow-y-auto rounded-pw-md bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg p-1 focus-visible:outline-none'
const ITEM =
  'flex items-center justify-between gap-2 min-h-8 py-1.5 px-2.5 rounded-pw-sm text-[0.8125rem] text-pw-text-2 cursor-pointer select-none outline-none data-[highlighted]:bg-pw-fill-strong data-[highlighted]:text-pw-text data-[state=checked]:text-pw-accent data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const ITEM_GROUP_LABEL = 'py-1.5 px-2.5 text-[0.6875rem] font-pw text-pw-text-3 uppercase tracking-wide'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return (
    <Ark.Root positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 4, ...local.positioning}} {...rest} />
  )
}

const Trigger = styledPart(Ark.Trigger, TRIGGER)
const Content = styledPart(Ark.Content, CONTENT)
const Item = styledPart(Ark.Item, ITEM)
const ItemGroupLabel = styledPart(Ark.ItemGroupLabel, ITEM_GROUP_LABEL)

export const Select = Object.assign({}, Ark, {Root, Trigger, Content, Item, ItemGroupLabel})
export {createListCollection} from '@ark-ui/solid/select'
