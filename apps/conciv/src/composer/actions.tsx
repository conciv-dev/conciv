import {Show, createSignal, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {useRouter} from '@tanstack/solid-router'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {Crosshair, FoldVertical, SquarePen} from 'lucide-solid'
import {getHostApi} from '@conciv/extension'
import type {Grab} from '@conciv/grab'
import {useAnnounce, useAppData, useAppQueryClient, useRpc} from '../app/context.js'
import type {Notify} from '../chat/notify.js'
import {LaunchMenu} from './launch-menu.js'
import {ConnectDialog} from './connect/connect-dialog.js'
import {useConnectFlow} from './connect/use-connect-flow.js'

const ACT =
  'size-8.5 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'

function busyClass(busy: boolean): string {
  return busy ? `${ACT} opacity-60 cursor-progress` : ACT
}

type LaunchResult = {supported: boolean; opened: boolean; command: string | null}

async function copyCommand(command: string, notify: Notify): Promise<void> {
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
  notify: Notify
}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const queryClient = useAppQueryClient()
  const router = useRouter()
  const announce = useAnnounce()
  const grab = getHostApi().useGrab()
  const toast = getHostApi().useToast()
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const harnessName = () => meta.data?.harness.name ?? 'the harness'

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

  const connect = useConnectFlow({
    utils: appData.utils,
    rpc,
    queryClient,
    harnessName,
    sessionId: () => props.sessionId,
    navigate: (sessionId) => void router.navigate({to: '/panel/$sessionId', params: {sessionId}}),
    notify: (message: string) => props.notify(message),
    announce,
    invalidateSessions: () => appData.invalidateSessions(),
  })

  return (
    <>
      <TooltipIconButton
        tooltip={grabDisabled() ? 'Nothing on this screen to select' : 'Select an element from the page'}
        class={busyClass(picking())}
        disabled={grabDisabled()}
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
      <Show when={meta.data === undefined || meta.data.harness.canLaunch}>
        <LaunchMenu
          harnessName={harnessName()}
          class={busyClass(launch.isPending || connect.busy() || meta.isPending)}
          pending={meta.isPending}
          failed={meta.isError}
          canConnect={meta.data?.harness.canAttach}
          onOpen={() => launch.mutate(true)}
          onCopy={() => launch.mutate(false)}
          onRetry={() => void meta.refetch()}
          onConnect={() => connect.start()}
          onPrefetch={() => connect.prefetch()}
        />
      </Show>
      <ConnectDialog
        step={connect.step()}
        harnessName={harnessName()}
        candidates={connect.candidates()}
        arrived={connect.arrived()}
        loading={connect.loading()}
        refreshing={connect.refreshing()}
        failure={connect.failure()}
        stale={connect.stale()}
        checkedAt={connect.checkedAt()}
        connectingId={connect.connectingId()}
        dialledIn={connect.dialledIn()}
        contactLost={connect.contactLost()}
        unreachable={connect.unreachable()}
        onPick={connect.pick}
        onRetry={connect.retry}
        onRefresh={connect.refresh}
        onLaunch={() => {
          connect.close()
          launch.mutate(true)
        }}
        onBack={connect.back}
        onDone={connect.done}
        onKeepWaiting={connect.keepWaiting}
        onHandBack={connect.handBack}
        onClose={connect.close}
      />
    </>
  )
}
