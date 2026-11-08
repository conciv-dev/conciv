import {createSignal, type JSX} from 'solid-js'
import {ComposerActions as Action} from '@conciv/ui-kit-chat'
import Crosshair from 'lucide-solid/icons/crosshair'
import FoldVertical from 'lucide-solid/icons/fold-vertical'
import SquarePen from 'lucide-solid/icons/square-pen'
import {getHostApi} from '@conciv/extension/host'
import type {Grab} from '@conciv/grab'
import {ConnectAgentsMenu} from './connect-agents-menu.js'

const ACT =
  'size-8 rounded-chat-pill [border:none] bg-transparent text-chat-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-chat-text-hi hover:bg-chat-fill-strong'

function busyClass(busy: boolean): string {
  return busy ? `${ACT} opacity-60 cursor-progress` : ACT
}

export function ComposerActions(props: {
  sessionId: string
  compacting: boolean
  onCompact: () => void
  onNewSession: () => void
  onStageGrab: (grab: Grab) => void
}): JSX.Element {
  const grab = getHostApi().useGrab()
  const toast = getHostApi().useToast()
  const grabDisabled = () => (grab.grabbable ? !grab.grabbable() : false)

  const [picking, setPicking] = createSignal(false)
  const pick = async () => {
    setPicking(true)
    try {
      const picked = await grab.pick()
      if (picked) props.onStageGrab(picked)
    } catch {
      toast('Couldn’t grab that element. Try again.', 'error')
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
      <ConnectAgentsMenu sessionId={props.sessionId} class={ACT} />
    </>
  )
}
