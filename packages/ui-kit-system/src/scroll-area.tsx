import {splitProps, type ComponentProps} from 'solid-js'
import {ScrollArea as Ark} from '@ark-ui/solid/scroll-area'

const SCROLLBAR =
  'flex p-0.5 opacity-0 pointer-events-none [transition:opacity_150ms] [&[data-hover]]:opacity-100 [&[data-scrolling]]:opacity-100 [&[data-hover]]:pointer-events-auto [&[data-scrolling]]:pointer-events-auto [&[data-orientation=vertical]]:w-2 [&[data-orientation=horizontal]]:h-2 [&[data-orientation=vertical]:not([data-overflow-y])]:hidden [&[data-orientation=horizontal]:not([data-overflow-x])]:hidden'
const THUMB =
  'w-full rounded-pw-pill bg-pw-accent-link [&[data-orientation=horizontal]]:w-auto [&[data-orientation=horizontal]]:h-full'

function Scrollbar(props: ComponentProps<typeof Ark.Scrollbar>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Scrollbar {...rest} class={`${SCROLLBAR}  ${local.class ?? ''}`} />
}

function Thumb(props: ComponentProps<typeof Ark.Thumb>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Thumb {...rest} class={`${THUMB}  ${local.class ?? ''}`} />
}

export const ScrollArea = Object.assign({}, Ark, {Scrollbar, Thumb})
