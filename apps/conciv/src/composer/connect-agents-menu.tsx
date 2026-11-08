import {For, Show, type JSX} from 'solid-js'
import {Menu, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {ComposerActions as Action} from '@conciv/ui-kit-chat'
import Plug from 'lucide-solid/icons/plug'
import {useHubConnections} from './hub-connections.js'

const MENU_LABEL = 'Connect agents'

export function ConnectAgentsMenu(props: {sessionId: string; class: string}): JSX.Element {
  const hub = useHubConnections(() => props.sessionId)
  const pending = (harnessId: string) => hub.connecting().some((install) => install.harnessId === harnessId)
  return (
    <Show when={hub.installs().length > 0}>
      <Action.Action priority={10}>
        <Action.Inline>
          <Menu.Root>
            <TooltipIconButtonSlot tooltip={MENU_LABEL} class={props.class}>
              {(buttonProps) => (
                <Menu.Trigger
                  asChild={(triggerProps) => (
                    <button {...buttonProps()} {...triggerProps()} aria-busy={hub.connecting().length > 0}>
                      <Plug class="size-5 block" aria-hidden="true" />
                    </button>
                  )}
                />
              )}
            </TooltipIconButtonSlot>
            <Menu.Positioner>
              <Menu.Content aria-label={MENU_LABEL}>
                <For each={hub.installs()}>
                  {(install) => (
                    <Menu.Item
                      value={install.harnessId}
                      disabled={pending(install.harnessId)}
                      onSelect={() => hub.connect(install)}
                    >
                      <Plug class="size-4 block" aria-hidden="true" />
                      Connect {install.name}
                    </Menu.Item>
                  )}
                </For>
              </Menu.Content>
            </Menu.Positioner>
          </Menu.Root>
        </Action.Inline>
        <For each={hub.installs()}>
          {(install) => (
            <Action.ActionMenuItem
              label={`Connect ${install.name}`}
              disabled={pending(install.harnessId)}
              onSelect={() => hub.connect(install)}
            >
              <Plug class="size-4 block" aria-hidden="true" />
            </Action.ActionMenuItem>
          )}
        </For>
      </Action.Action>
    </Show>
  )
}
