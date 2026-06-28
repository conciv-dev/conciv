import {splitProps, type ComponentProps} from 'solid-js'
import {Popover as Ark} from '@ark-ui/solid/popover'

const CONTENT =
  'hidden data-[state=open]:block data-[state=open]:anim-rise z-[2147483647] rounded-pw-lg bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg focus-visible:outline-none'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning'])
  return <Ark.Root positioning={{strategy: 'fixed', placement: 'top-end', gutter: 8, ...local.positioning}} {...rest} />
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`} />
}

export const Popover = Object.assign({}, Ark, {Root, Content})
