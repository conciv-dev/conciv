import {mergeProps, splitProps, type ComponentProps} from 'solid-js'
import {
  Popover as Ark,
  usePopover as useArkPopover,
  type UsePopoverProps,
  type UsePopoverReturn,
} from '@ark-ui/solid/popover'
import {LIST_PANEL} from './list-panel.js'

const CONTENT =
  'hidden data-[state=open]:block data-[state=open]:anim-pop z-[2147483647] rounded-chat-surface-lg bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg focus-visible:outline-none'
const LIST_CONTENT = `hidden data-[state=open]:block data-[state=open]:anim-combo ${LIST_PANEL}`
const POSITIONING = {strategy: 'fixed', placement: 'top-end', gutter: 8} as const

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return <Ark.Root positioning={{...POSITIONING, ...local.positioning}} {...rest} />
}

export type PopoverMachine = UsePopoverReturn

export function usePopover(props: UsePopoverProps = {}): PopoverMachine {
  return useArkPopover(
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

function ListContent(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${LIST_CONTENT}  ${local.class ?? ''}`} />
}

export const Popover = Object.assign({}, Ark, {Root, Content, ListContent})
export type PopoverApi = typeof Popover
