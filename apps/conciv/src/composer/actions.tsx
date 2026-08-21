import {Show, createSignal, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {ComposerActions as Action} from '@conciv/ui-kit-chat'
import Crosshair from 'lucide-solid/icons/crosshair'
import FoldVertical from 'lucide-solid/icons/fold-vertical'
import SquarePen from 'lucide-solid/icons/square-pen'
import {getHostApi} from '@conciv/extension/host'
import type {Grab} from '@conciv/grab'
import {useAppData} from '../app/context.js'
import {useNotices} from '../shell/notice-context.js'
import type {Notify} from '../shell/notices.js'
import {LaunchMenu} from './launch-menu.js'
import {SessionModelSelector} from './model-selector.js'
import {terminalRpc} from './terminal-rpc.js'

const ACT =
  'size-8 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'

function busyClass(busy: boolean): string {
  return busy ? `${ACT} opacity-60 cursor-progress` : ACT
}

type LaunchOutcome = {opened: boolean; command: string | null}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string')
    return error.code
  return null
}

async function copyCommand(notify: Notify, command: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(command)
    notify('Command copied. Paste it in your terminal.')
  } catch {
    notify(`Run in your terminal: ${command}`)
  }
}

export function ComposerActions(props: {
  sessionId: string
  compacting: boolean
  onCompact: () => void
  onNewSession: () => void
  onStageGrab: (grab: Grab) => void
}): JSX.Element {
  const appData = useAppData()
  const notices = useNotices()
  const grab = getHostApi().useGrab()
  const toast = getHostApi().useToast()
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const harnessName = () => (meta.isSuccess ? meta.data.harness.name : 'the harness')
  const terminal = terminalRpc()

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

  const launchFailure = (error: unknown): string => {
    if (errorCode(error) === 'NO_CONNECT') return `${harnessName()} can’t be opened in a terminal.`
    return `Couldn’t open ${harnessName()}.`
  }

  const openExternal = useMutation(() => ({
    mutationFn: async (): Promise<LaunchOutcome> => {
      const {ok} = await terminal.launch({sessionId: props.sessionId})
      if (ok) return {opened: true, command: null}
      const {command} = await terminal.connectCommand({sessionId: props.sessionId})
      return {opened: false, command}
    },
    onSuccess: async (outcome: LaunchOutcome) => {
      if (outcome.opened) {
        notices.notify(`Opened in ${harnessName()}.`)
        return
      }
      if (outcome.command) await copyCommand(notices.notify, outcome.command)
    },
    onError: (error: unknown) => notices.notify(launchFailure(error), {tone: 'warn'}),
  }))

  const copyConnect = useMutation(() => ({
    mutationFn: () => terminal.connectCommand({sessionId: props.sessionId}),
    onSuccess: (result: {command: string}) => void copyCommand(notices.notify, result.command),
    onError: (error: unknown) => notices.notify(launchFailure(error), {tone: 'warn'}),
  }))

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
      <Show when={meta.data === undefined || meta.data.harness.canLaunch}>
        <LaunchMenu
          harnessName={harnessName()}
          class={busyClass(openExternal.isPending || copyConnect.isPending || meta.isPending)}
          pending={meta.isPending}
          failed={meta.isError}
          onOpen={() => openExternal.mutate()}
          onCopy={() => copyConnect.mutate()}
          onRetry={() => void meta.refetch()}
        />
      </Show>
      <SessionModelSelector sessionId={props.sessionId} />
    </>
  )
}
