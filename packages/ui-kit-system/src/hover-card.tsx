import type {JSX} from 'solid-js'
import {HoverCard as Ark} from '@ark-ui/solid/hover-card'

const CONTENT =
  'hidden data-[state=open]:block data-[state=open]:anim-combo z-[2147483647] w-60 rounded-pw-md overflow-hidden bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg text-[0.75rem] focus-visible:outline-none'

export function HoverCard(props: {
  trigger: JSX.Element
  triggerClass?: string
  children: JSX.Element
  openDelay?: number
  closeDelay?: number
  sideOffset?: number
  class?: string
  label?: string
}): JSX.Element {
  return (
    <Ark.Root
      openDelay={props.openDelay ?? 0}
      closeDelay={props.closeDelay ?? 120}
      positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: props.sideOffset ?? 6}}
    >
      <Ark.Trigger class={props.triggerClass} aria-label={props.label}>
        {props.trigger}
      </Ark.Trigger>
      <Ark.Positioner>
        <Ark.Content class={`${CONTENT}  ${props.class ?? ''}`}>{props.children}</Ark.Content>
      </Ark.Positioner>
    </Ark.Root>
  )
}
