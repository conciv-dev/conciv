import {Show, createSignal, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {Crosshair, FoldVertical, SquarePen} from 'lucide-solid'
import {getReactGrabAdapter} from '@conciv/page'
import type {Grab} from '@conciv/grab'
import {useAppData, useRpc} from '../app/context.js'
import {LaunchMenu} from './launch-menu.js'

const ACT =
  'size-8.5 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'

function busyClass(busy: boolean): string {
  return busy ? `${ACT} opacity-60 cursor-progress` : ACT
}

type LaunchResult = {supported: boolean; opened: boolean; command: string | null}

async function copyCommand(command: string, notify: (message: string) => void): Promise<void> {
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
  notify: (message: string) => void
}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const harnessName = () => meta.data?.harness.name ?? 'the harness'

  const [picking, setPicking] = createSignal(false)
  const pick = async () => {
    setPicking(true)
    try {
      const adapter = await getReactGrabAdapter()
      adapter.activate((grab) => props.onStageGrab(grab))
    } finally {
      setPicking(false)
    }
  }

  const launch = useMutation(() => ({
    mutationFn: (open: boolean) => rpc.sessions.launch({sessionId: props.sessionId, open}),
    onSuccess: async (result: LaunchResult, open: boolean) => {
      if (!result.supported || !result.command) {
        props.notify(`${harnessName()} can’t be opened in a terminal.`)
        return
      }
      if (open && result.opened) {
        props.notify(`Opened in ${harnessName()}.`)
        return
      }
      await copyCommand(result.command, props.notify)
    },
    onError: () => props.notify(`Couldn’t open ${harnessName()}.`),
  }))

  return (
    <>
      <TooltipIconButton
        tooltip="Select an element from the page"
        class={busyClass(picking())}
        onClick={() => void pick()}
      >
        <Crosshair class="size-5 block" />
      </TooltipIconButton>
      <TooltipIconButton tooltip="Start a new session" class={ACT} onClick={() => props.onNewSession()}>
        <SquarePen class="size-5 block" />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="Compress the conversation"
        class={busyClass(props.compacting)}
        onClick={() => props.onCompact()}
      >
        <FoldVertical class="size-5 block" />
      </TooltipIconButton>
      <Show when={meta.data?.harness.canLaunch}>
        <LaunchMenu
          harnessName={harnessName()}
          class={busyClass(launch.isPending)}
          onOpen={() => launch.mutate(true)}
          onCopy={() => launch.mutate(false)}
        />
      </Show>
    </>
  )
}
