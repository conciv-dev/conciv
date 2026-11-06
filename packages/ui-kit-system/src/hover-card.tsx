import {splitProps, type ComponentProps} from 'solid-js'
import {HoverCard as Ark} from '@ark-ui/solid/hover-card'

const CONTENT =
  'hidden data-[state=open]:block data-[state=open]:anim-combo z-[2147483647] rounded-chat-surface-md bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg font-chat focus-visible:outline-none'
const POSITIONING = {strategy: 'fixed', placement: 'bottom-start', gutter: 6} as const

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return <Ark.Root positioning={{...POSITIONING, ...local.positioning}} {...rest} />
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`} />
}

export const HoverCard = Object.assign({}, Ark, {Root, Content})
