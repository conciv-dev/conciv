import {splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Popover} from '@mandarax/ui-kit-system'

// The FAB + popover shell (replaces the widget's hand-rolled floating-ui popover). Thin wrapper over
// the ui-kit-system Popover. openOnRunStart is a widget concern (it controls `open`); kept in the
// prop surface for parity.
type RootProps = ComponentProps<typeof Popover.Root> & {openOnRunStart?: boolean}

function Root(props: RootProps): JSX.Element {
  const [, rest] = splitProps(props, ['openOnRunStart'])
  return <Popover.Root {...rest} />
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
