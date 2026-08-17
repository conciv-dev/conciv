import {Match, Show, Switch, splitProps, type JSX} from 'solid-js'
import {Menu, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {ComposerActions as Action} from '@conciv/ui-kit-chat'
import ClipboardCopy from 'lucide-solid/icons/clipboard-copy'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import SquareTerminal from 'lucide-solid/icons/square-terminal'

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
    <Action.Action priority={10} disabled={() => local.pending === true}>
      <Action.Inline>
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
                    {optionsUnavailable(local.harnessName)}: {RETRY_LABEL}
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
      </Action.Inline>
      <Show
        when={local.failed === true}
        fallback={
          <>
            <Action.ActionMenuItem label={`Open in ${local.harnessName}`} onSelect={() => local.onOpen()}>
              <SquareTerminal class="size-4 block" aria-hidden="true" />
            </Action.ActionMenuItem>
            <Action.ActionMenuItem label="Copy command" onSelect={() => local.onCopy()}>
              <ClipboardCopy class="size-4 block" aria-hidden="true" />
            </Action.ActionMenuItem>
          </>
        }
      >
        <Action.ActionMenuItem
          label={`${optionsUnavailable(local.harnessName)}: ${RETRY_LABEL}`}
          onSelect={() => local.onRetry?.()}
        >
          <RotateCw class="size-4 block" aria-hidden="true" />
        </Action.ActionMenuItem>
      </Show>
    </Action.Action>
  )
}
