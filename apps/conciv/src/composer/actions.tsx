import {Show, createMemo, createSignal, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {Crosshair, FoldVertical, SquarePen} from 'lucide-solid'
import {getReactGrabAdapter} from '@conciv/page'
import type {Grab} from '@conciv/grab'
import type {LiveSession} from '@conciv/contract'
import {useAppData, useRpc} from '../app/context.js'
import {errorMessageFor} from '../chat/external-session.js'
import type {Notify} from '../chat/notify.js'
import {LaunchMenu} from './launch-menu.js'
import {ConnectSessionDialog, candidateTitle, type ConnectStep} from './connect-dialog.js'

const ACT =
  'size-8.5 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'

const READY_POLL_MS = 1500

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

  const [connectStep, setConnectStep] = createSignal<ConnectStep | null>(null)

  const awaitedSession = createMemo(() => {
    const step = connectStep()
    return step?.step === 'reload' ? step.session.sessionId : null
  })

  const readiness = useQuery(() => ({
    queryKey: ['attach-readiness', awaitedSession()],
    queryFn: () => rpc.sessions.attachCandidates(),
    enabled: awaitedSession() !== null,
    refetchInterval: READY_POLL_MS,
  }))

  const dialedIn = createMemo(() => {
    const awaited = awaitedSession()
    if (awaited === null) return false
    return readiness.data?.some((session) => session.sessionId === awaited && session.ready) ?? false
  })

  const detach = () => {
    void rpc.sessions
      .attachDetach({sessionId: props.sessionId})
      .then(() => appData.invalidateSessions())
      .catch(() => props.notify('Could not hand the session back. Try the terminal menu again.'))
  }

  const announceConnected = (session: LiveSession) => {
    props.notify(`Connected: ${candidateTitle(session)}`, {label: 'Undo', run: detach})
  }

  const candidatesNow = (fallback: LiveSession): LiveSession[] => {
    const step = connectStep()
    if (step?.step === 'picking') return step.candidates
    if (step?.step === 'reload') return step.candidates
    return [fallback]
  }

  const connect = useMutation(() => ({
    mutationFn: () => rpc.sessions.attachCandidates(),
    onSuccess: (candidates: LiveSession[]) => {
      const only = candidates.length === 1 ? candidates[0] : undefined
      if (only?.ready) {
        adopt.mutate(only)
        return
      }
      setConnectStep({step: 'picking', candidates})
    },
    onError: () => props.notify(`Couldn’t look for running ${harnessName()} sessions.`),
  }))

  const showSnippet = async (detail: string): Promise<void> => {
    const fallback = await rpc.sessions.connectCommand({sessionId: props.sessionId})
    if (!fallback.command) {
      props.notify(detail)
      setConnectStep(null)
      return
    }
    setConnectStep({step: 'snippet', command: fallback.command, detail})
  }

  const adopt = useMutation(() => ({
    mutationFn: (session: LiveSession) =>
      rpc.sessions.attachAdopt({
        harnessSessionId: session.sessionId,
        pid: session.pid,
        force: session.relation === 'descendant',
      }),
    onSuccess: (result: {sessionId: string; reloadCommand: string}, session: LiveSession) => {
      appData.invalidateSessions()
      if (session.ready) {
        setConnectStep(null)
        announceConnected(session)
        return
      }
      setConnectStep({step: 'reload', session, command: result.reloadCommand, candidates: candidatesNow(session)})
    },
    onError: (error: unknown) => {
      const install = errorMessageFor(error, 'INSTALL_FAILED')
      if (install !== null) {
        void showSnippet(install)
        return
      }
      props.notify(errorMessageFor(error, 'CWD_MISMATCH') ?? `Couldn’t connect that ${harnessName()} session.`)
      setConnectStep(null)
    },
  }))

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

  const finishReload = (session: LiveSession) => {
    setConnectStep(null)
    appData.invalidateSessions()
    announceConnected(session)
  }

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
          class={busyClass(launch.isPending || connect.isPending || adopt.isPending)}
          canConnect={meta.data?.harness.canAttach}
          onOpen={() => launch.mutate(true)}
          onCopy={() => launch.mutate(false)}
          onConnect={() => connect.mutate()}
        />
      </Show>
      <ConnectSessionDialog
        state={connectStep()}
        connected={dialedIn()}
        onPick={(session) => adopt.mutate(session)}
        onCopy={(text) => void copyCommand(text, props.notify)}
        onClose={() => setConnectStep(null)}
        onBack={(candidates) => setConnectStep({step: 'picking', candidates})}
        onDone={finishReload}
        onLaunch={() => {
          setConnectStep(null)
          launch.mutate(true)
        }}
      />
    </>
  )
}
