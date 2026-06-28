import {splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Menu} from '@mandarax/ui-kit-system'

// Overflow menu over the ui-kit-system Menu (Ark headless). Shared shape with ThreadListItemMore.
// Item carries a `value` (Ark needs it for keyboard nav) plus an onSelect run on activation.

type RootProps = ComponentProps<typeof Menu.Root>

function Root(props: RootProps): JSX.Element {
  return <Menu.Root {...props} />
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
