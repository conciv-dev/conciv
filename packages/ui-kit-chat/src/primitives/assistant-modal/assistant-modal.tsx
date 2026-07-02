import {createEffect, createMemo, createSignal, splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Popover} from '@conciv/ui-kit-system'
import {useChatContextOptional} from '../../store/chat-context.js'

type RootProps = ComponentProps<typeof Popover.Root> & {openOnRunStart?: boolean}

function Root(props: RootProps): JSX.Element {
  const [local, rest] = splitProps(props, ['openOnRunStart', 'open', 'onOpenChange', 'defaultOpen'])
  const chat = useChatContextOptional()
  const [internalOpen, setInternalOpen] = createSignal(local.defaultOpen ?? false)
  const isRunning = createMemo(() => (chat ? chat.status() === 'streaming' || chat.status() === 'submitted' : false))

  let wasRunning = isRunning()
  createEffect(() => {
    const running = isRunning()
    if (local.openOnRunStart !== false && running && !wasRunning) setInternalOpen(true)
    wasRunning = running
  })
  const open = () => (local.open === undefined ? internalOpen() : local.open)
  return (
    <Popover.Root
      open={open()}
      onOpenChange={(details) => {
        setInternalOpen(details.open)
        local.onOpenChange?.(details)
      }}
      {...rest}
    />
  )
}

function Trigger(props: ComponentProps<typeof Popover.Trigger>): JSX.Element {
  return <Popover.Trigger {...props} />
}

function Anchor(props: ComponentProps<typeof Popover.Anchor>): JSX.Element {
  return <Popover.Anchor {...props} />
}

function Content(props: ComponentProps<typeof Popover.Content>): JSX.Element {
  return (
    <Popover.Positioner>
      <Popover.Content {...props} />
    </Popover.Positioner>
  )
}

export const AssistantModal = Object.assign(Root, {Root, Trigger, Anchor, Content})
