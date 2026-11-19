import {createSignal, type JSX, For, Show} from 'solid-js'
import {ComposerActions as Action} from '@conciv/ui-kit-chat'
import Crosshair from 'lucide-solid/icons/crosshair'
import FoldVertical from 'lucide-solid/icons/fold-vertical'
import SquarePen from 'lucide-solid/icons/square-pen'
import {showToast} from '@conciv/page'
import type {Grab} from '@conciv/grab'
import {usePane} from '../app/pane-context.js'
import {makePaneGrabApi} from '../pane/pane-grab.js'
import {Menu, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import Plug from 'lucide-solid/icons/plug'
import {useHubConnections} from './hub-connections.js'

const MENU_LABEL = 'Connect agents'

function ConnectAgentsMenu(props: {class: string}): JSX.Element {
  const hub = useHubConnections()
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
                      disabled={hub.busy(install.harnessId)}
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
              disabled={hub.busy(install.harnessId)}
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

const ACT =
  'size-8 rounded-chat-pill [border:none] bg-transparent text-chat-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-chat-text-hi hover:bg-chat-fill-strong'

function busyClass(busy: boolean): string {
  return busy ? `${ACT} opacity-60 cursor-progress` : ACT
}

export function ComposerActions(props: {
  compacting: boolean
  onCompact: () => void
  onNewSession: () => void
  onStageGrab: (grab: Grab) => void
}): JSX.Element {
  const pane = usePane()
  const grab = makePaneGrabApi(pane.grabStaging, pane.grabProvider)
  const grabDisabled = () => (grab.grabbable ? !grab.grabbable() : false)

  const [picking, setPicking] = createSignal(false)
  const pick = async () => {
    setPicking(true)
    try {
      const picked = await grab.pick()
      if (picked) props.onStageGrab(picked)
    } catch {
      showToast('Couldn’t grab that element. Try again.', 'error')
    } finally {
      setPicking(false)
    }
  }

  return (
    <>
      <Action.ActionButton
        priority={40}
        disabled={grabDisabled}
        tooltip={grabDisabled() ? 'Nothing on this screen to select' : 'Select an element from the page'}
        busy={picking()}
        class={busyClass(picking())}
        onClick={() => void pick()}
      >
        <Crosshair class="size-5 block" />
      </Action.ActionButton>
      <Action.ActionButton priority={30} tooltip="Start a new session" class={ACT} onClick={() => props.onNewSession()}>
        <SquarePen class="size-5 block" />
      </Action.ActionButton>
      <Action.ActionButton
        priority={20}
        disabled={() => props.compacting}
        tooltip="Compress the conversation"
        class={busyClass(props.compacting)}
        onClick={() => props.onCompact()}
      >
        <FoldVertical class="size-5 block" />
      </Action.ActionButton>
      <ConnectAgentsMenu class={ACT} />
    </>
  )
}
