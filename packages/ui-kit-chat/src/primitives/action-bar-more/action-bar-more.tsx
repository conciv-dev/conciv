import {onCleanup, splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Menu} from '@mandarax/ui-kit-system'
import {useActionBarInteraction} from '../action-bar/interaction-context.js'

// Overflow menu over the ui-kit-system Menu (Ark headless). Shared shape with ThreadListItemMore.
// Item carries a `value` (Ark needs it for keyboard nav) plus an onSelect run on activation.

type RootProps = ComponentProps<typeof Menu.Root>

function Root(props: RootProps): JSX.Element {
  const [local, rest] = splitProps(props, ['onOpenChange'])
  const interaction = useActionBarInteraction()
  let release: (() => void) | null = null
  const setOpen = (open: boolean) => {
    if (open) {
      if (release) return
      release = interaction?.acquireInteractionLock() ?? null
      return
    }
    release?.()
    release = null
  }
  onCleanup(() => {
    release?.()
    release = null
  })
  return (
    <Menu.Root
      onOpenChange={(details) => {
        setOpen(details.open)
        local.onOpenChange?.(details)
      }}
      {...rest}
    />
  )
}

function Trigger(props: ComponentProps<typeof Menu.Trigger>): JSX.Element {
  return <Menu.Trigger {...props} />
}

function Content(props: ComponentProps<typeof Menu.Content>): JSX.Element {
  return (
    <Menu.Positioner>
      <Menu.Content {...props} />
    </Menu.Positioner>
  )
}

type ItemProps = ComponentProps<typeof Menu.Item> & {onSelect?: () => void}

function Item(props: ItemProps): JSX.Element {
  const [local, rest] = splitProps(props, ['onSelect', 'onClick'])
  return (
    <Menu.Item
      onClick={(event) => {
        local.onSelect?.()
        if (typeof local.onClick === 'function') local.onClick(event)
      }}
      {...rest}
    />
  )
}

function Separator(props: ComponentProps<typeof Menu.Separator>): JSX.Element {
  return <Menu.Separator {...props} />
}

export const ActionBarMore = Object.assign(Root, {Root, Trigger, Content, Item, Separator})
