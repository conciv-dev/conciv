import {splitProps, type ComponentProps} from 'solid-js'
import {Tooltip as Ark} from '@ark-ui/solid/tooltip'

const CONTENT =
  'hidden data-[state=open]:block data-[state=open]:anim-combo z-[2147483647] rounded-pw-sm bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg py-1 px-2 text-[0.6875rem] max-w-60 focus-visible:outline-none'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning', 'openDelay', 'closeDelay'])
  return (
    <Ark.Root
      openDelay={local.openDelay ?? 300}
      closeDelay={local.closeDelay ?? 80}
      positioning={{strategy: 'fixed', placement: 'top', gutter: 6, ...local.positioning}}
      {...rest}
    />
  )
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`} />
}

export const Tooltip = Object.assign({}, Ark, {Root, Content})
