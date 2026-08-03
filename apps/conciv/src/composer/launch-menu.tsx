import {Match, Switch, splitProps, type JSX} from 'solid-js'
import {Menu, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {ClipboardCopy, RotateCw, SquareTerminal} from 'lucide-solid'

const RETRY_LABEL = 'Try again'

function optionsUnavailable(harnessName: string): string {
  return `Terminal options unavailable for ${harnessName}`
}

export function LaunchMenu(props: {
  harnessName: string
  class: string
  pending?: boolean
  failed?: boolean
  onOpen: () => void
  onCopy: () => void
  onRetry?: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['harnessName', 'class', 'pending', 'failed', 'onOpen', 'onCopy', 'onRetry'])
  return (
    <Menu.Root>
      <TooltipIconButtonSlot tooltip={`Terminal options for ${local.harnessName}`} class={local.class}>
        {(buttonProps) => (
          <Menu.Trigger
            asChild={(triggerProps) => (
              <button
                {...buttonProps()}
                {...triggerProps()}
                disabled={local.pending === true}
                aria-busy={local.pending === true}
              >
                <SquareTerminal class="size-5 block" aria-hidden="true" />
              </button>
            )}
          />
        )}
      </TooltipIconButtonSlot>
      <Menu.Positioner>
        <Menu.Content aria-label={`Terminal options for ${local.harnessName}`}>
          <Switch>
            <Match when={local.failed === true}>
              <Menu.Item value="retry" onSelect={() => local.onRetry?.()}>
                <RotateCw class="size-4 block" aria-hidden="true" />
                {optionsUnavailable(local.harnessName)} — {RETRY_LABEL}
              </Menu.Item>
            </Match>
            <Match when={true}>
              <Menu.Item value="open" onSelect={() => local.onOpen()}>
                <SquareTerminal class="size-4 block" aria-hidden="true" />
                Open in {local.harnessName}
              </Menu.Item>
              <Menu.Item value="copy" onSelect={() => local.onCopy()}>
                <ClipboardCopy class="size-4 block" aria-hidden="true" />
                Copy command
              </Menu.Item>
            </Match>
          </Switch>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  )
}
