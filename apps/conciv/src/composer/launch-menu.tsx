import {splitProps, type JSX} from 'solid-js'
import {Menu, TooltipIconButton} from '@conciv/ui-kit-system'
import {ClipboardCopy, SquareTerminal} from 'lucide-solid'

export function LaunchMenu(props: {
  harnessName: string
  class: string
  onOpen: () => void
  onCopy: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['harnessName', 'class', 'onOpen', 'onCopy'])
  return (
    <Menu.Root>
      <Menu.Trigger
        asChild={(triggerProps) => (
          <TooltipIconButton tooltip={`Open in ${local.harnessName}`} class={local.class} {...triggerProps()}>
            <SquareTerminal class="size-5 block" />
          </TooltipIconButton>
        )}
      />
      <Menu.Positioner>
        <Menu.Content aria-label="Terminal launch options">
          <Menu.Item value="open" onSelect={() => local.onOpen()}>
            <SquareTerminal class="size-4 block" aria-hidden="true" />
            Open in {local.harnessName}
          </Menu.Item>
          <Menu.Item value="copy" onSelect={() => local.onCopy()}>
            <ClipboardCopy class="size-4 block" aria-hidden="true" />
            Copy command
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  )
}
