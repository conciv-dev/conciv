import {createSignal, Show, splitProps, type Accessor, type JSX} from 'solid-js'
import {Tooltip} from './tooltip.js'

export type TruncatedTextSide = 'top' | 'bottom' | 'left' | 'right'

const ROUNDING_SLACK = 1

export const CLIP_REVEAL = 'max-w-[25rem] [overflow-wrap:anywhere]'

function isClipped(element: HTMLElement | undefined): boolean {
  if (element === undefined) return false
  return element.scrollWidth - element.clientWidth > ROUNDING_SLACK
}

export type ClipReveal = {
  clipped: Accessor<boolean>
  ref: (node: HTMLElement) => void
  onOpenChange: (details: {open: boolean}) => void
}

export function revealTriggerProps<T extends {'aria-describedby'?: string | undefined}>(
  reveal: ClipReveal,
  triggerProps: T,
): T {
  return {...triggerProps, 'aria-describedby': reveal.clipped() ? triggerProps['aria-describedby'] : undefined}
}

export function createClipReveal(): ClipReveal {
  const [clipped, setClipped] = createSignal(false)
  let element: HTMLElement | undefined
  return {
    clipped,
    ref: (node) => {
      element = node
    },
    onOpenChange: (details) => setClipped(details.open && isClipped(element)),
  }
}

export type TruncatedTextProps = {
  text: string
  class?: string
  side?: TruncatedTextSide
  children?: JSX.Element
}

export function TruncatedText(props: TruncatedTextProps): JSX.Element {
  const [local] = splitProps(props, ['text', 'class', 'side', 'children'])
  const reveal = createClipReveal()
  return (
    <Tooltip.Root
      onOpenChange={reveal.onOpenChange}
      positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}}
      lazyMount
      unmountOnExit
    >
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <span
            {...revealTriggerProps(reveal, triggerProps())}
            ref={reveal.ref}
            class={`truncate ${local.class ?? ''}`}
          >
            {local.children ?? local.text}
          </span>
        )}
      />
      <Show when={reveal.clipped()}>
        <Tooltip.Positioner>
          <Tooltip.Content class={CLIP_REVEAL}>{local.text}</Tooltip.Content>
        </Tooltip.Positioner>
      </Show>
    </Tooltip.Root>
  )
}
