import {splitProps, type ComponentProps} from 'solid-js'
import {SegmentGroup as Ark} from '@ark-ui/solid/segment-group'

export type SegmentGroupVariant = 'segmented' | 'plain'

const ROOT =
  'relative inline-flex items-center gap-0.5 p-0.5 rounded-chat-surface-sm bg-chat-fill-soft [border:1px_solid_var(--chat-line)] data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[disabled]:opacity-50'
const INDICATOR =
  'rounded-chat-surface-sm bg-chat-fill-strong [border:1px_solid_var(--chat-line-2)] shadow-chat-sm [width:var(--width)] [height:var(--height)] [left:var(--left)] [top:var(--top)] [--transition-duration:200ms] [--transition-timing-function:var(--chat-ease-expo)] motion-reduce:[--transition-duration:0.01ms]'
const ITEM =
  'relative inline-flex items-center justify-center gap-1.5 min-h-8 py-1 px-3 rounded-chat-surface-sm text-[0.8125rem] font-chat text-chat-text-3 whitespace-nowrap cursor-pointer select-none trans-color-bg hover:text-chat-text-2 data-[state=checked]:text-chat-text-hi data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem] data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const ITEM_TEXT = 'inline-flex items-center gap-1.5'

function skin(variant: SegmentGroupVariant | undefined, base: string, extra: string | undefined): string {
  if (variant === 'plain') return extra ?? ''
  return `${base}  ${extra ?? ''}`
}

function Root(props: ComponentProps<typeof Ark.Root> & {variant?: SegmentGroupVariant}) {
  const [local, rest] = splitProps(props, ['class', 'orientation', 'variant'])
  return (
    <Ark.Root
      orientation={local.orientation ?? 'horizontal'}
      {...rest}
      class={skin(local.variant, ROOT, local.class)}
    />
  )
}

function Indicator(props: ComponentProps<typeof Ark.Indicator> & {variant?: SegmentGroupVariant}) {
  const [local, rest] = splitProps(props, ['class', 'variant'])
  return <Ark.Indicator {...rest} class={skin(local.variant, INDICATOR, local.class)} />
}

function Item(props: ComponentProps<typeof Ark.Item> & {variant?: SegmentGroupVariant}) {
  const [local, rest] = splitProps(props, ['class', 'variant'])
  return <Ark.Item {...rest} class={skin(local.variant, ITEM, local.class)} />
}

function ItemText(props: ComponentProps<typeof Ark.ItemText> & {variant?: SegmentGroupVariant}) {
  const [local, rest] = splitProps(props, ['class', 'variant'])
  return <Ark.ItemText {...rest} class={skin(local.variant, ITEM_TEXT, local.class)} />
}

export const SegmentGroup = Object.assign({}, Ark, {Root, Indicator, Item, ItemText})
