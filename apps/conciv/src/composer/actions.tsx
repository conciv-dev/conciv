import {Show, createSignal, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {Crosshair, FoldVertical, SquarePen, SquareTerminal} from 'lucide-solid'
import {getReactGrabAdapter} from '@conciv/page'
import type {Grab} from '@conciv/grab'
import {useApp} from '../app/context.js'

const ACT =
  'size-8.5 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'

function busyClass(busy: boolean): string {
  return busy ? `${ACT} opacity-60 cursor-progress` : ACT
}

export function ComposerActions(props: {
  sessionId: string
  compacting: boolean
  onCompact: () => void
  onNewSession: () => void
  onStageGrab: (grab: Grab) => void
  notify: (message: string) => void
}): JSX.Element {
  const app = useApp()
  const meta = useQuery(() => app.data.utils.meta.models.queryOptions())
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
    mutationFn: () => app.rpc.sessions.launch({sessionId: props.sessionId}),
    onSuccess: async (result: {supported: boolean; opened: boolean; command: string | null}) => {
      if (!result.supported || !result.command) {
        props.notify(`${harnessName()} can’t be opened in a terminal.`)
        return
      }
      if (result.opened) {
        props.notify(`Opened in ${harnessName()}.`)
        return
      }
      try {
        await navigator.clipboard.writeText(result.command)
        props.notify('Command copied — paste it in your terminal.')
      } catch {
        props.notify(`Run in your terminal: ${result.command}`)
      }
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
        <TooltipIconButton
          tooltip={`Open in ${harnessName()}`}
          class={busyClass(launch.isPending)}
          onClick={() => launch.mutate()}
        >
          <SquareTerminal class="size-5 block" />
        </TooltipIconButton>
      </Show>
    </>
  )
}
