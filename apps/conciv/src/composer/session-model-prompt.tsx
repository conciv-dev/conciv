import {Suspense, type JSX} from 'solid-js'
import {useMutation, useQuery} from '@conciv/client'
import {HarnessModelSelector, type ModelMenu, type ModelSwitchTarget} from '@conciv/ui-kit-chat'
import type {ReasoningEffort} from '@conciv/protocol/chat-types'
import {useAnnounce, useAppData, useLayers, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {useRefetchSessionHarness, useSessionModels} from '../data/harness-meta.js'
import {useNotices} from '../shell/notice-context.js'
import {rpcErrorCode, SESSION_NOT_FOUND_MESSAGE} from '../shell/rpc-error-message.js'

type SessionModelPromptProps = {
  sessionId: string
  menu: ModelMenu
  running: boolean
}

function switchFailure(error: unknown, target: ModelSwitchTarget): string {
  const code = rpcErrorCode(error)
  if (code === 'SESSION_RUNNING') return `Wait for the reply to finish, then switch to ${target.harness.name}.`
  if (code === 'UNKNOWN_HARNESS') return `${target.harness.name} is no longer available.`
  if (code === 'UNKNOWN_MODEL') return `${target.label} is no longer available.`
  if (code === 'NOT_FOUND') return SESSION_NOT_FOUND_MESSAGE
  return `Couldn’t switch to ${target.label}.`
}

function readStatus(read: {isPending: boolean; isError: boolean; data: unknown}): 'loading' | 'failed' | 'ready' {
  if (read.isPending) return 'loading'
  return read.isError && read.data === undefined ? 'failed' : 'ready'
}

function pendingOr<Variables, Value>(
  mutation: {isPending: boolean; variables: Variables | undefined},
  pick: (variables: Variables) => Value,
): Value | undefined {
  return mutation.isPending && mutation.variables !== undefined ? pick(mutation.variables) : undefined
}

function useSessionChoices(sessionId: () => string) {
  const appData = useAppData()
  const rpc = useRpc()
  const notices = useNotices()
  const pane = usePane()
  const refetchSessionHarness = useRefetchSessionHarness()
  const setModel = useMutation(() => ({
    mutationFn: (input: {sessionId: string; model: string}) => rpc.sessions.model(input),
    onSettled: (_result, _error, input) => appData.invalidateSession(input.sessionId),
  }))
  const setEffort = useMutation(() => ({
    mutationFn: (input: {sessionId: string; effort: ReasoningEffort | null}) => rpc.sessions.effort(input),
    onSettled: (_result, _error, input) => appData.invalidateSession(input.sessionId),
  }))
  const switchHarness = useMutation(() => ({
    mutationFn: (target: ModelSwitchTarget) =>
      rpc.sessions.switchHarness({sessionId: sessionId(), harnessId: target.harness.id, model: target.model.id}),
    onSuccess: async () => {
      const [, refreshed] = await Promise.allSettled([refetchSessionHarness(sessionId()), pane.chat().refresh()])
      if (refreshed.status === 'rejected')
        notices.notify('Couldn’t refresh the conversation. Refresh it to see which harness wrote each reply.', {
          tone: 'warn',
        })
    },
    onError: (error: unknown, target: ModelSwitchTarget) =>
      notices.notify(switchFailure(error, target), {tone: 'warn'}),
  }))
  return {setModel, setEffort, switchHarness}
}

function SessionModelSelector(props: SessionModelPromptProps): JSX.Element {
  const appData = useAppData()
  const announce = useAnnounce()
  const layers = useLayers()
  const pane = usePane()
  const own = useSessionModels(() => props.sessionId)
  const catalog = useQuery(() => appData.utils.meta.harnesses.queryOptions())
  const session = useQuery(() => appData.utils.sessions.get.queryOptions({input: {sessionId: props.sessionId}}))
  const {setModel, setEffort, switchHarness} = useSessionChoices(() => props.sessionId)
  const row = () => (session.isPending ? undefined : session.data)
  return (
    <HarnessModelSelector
      appearance="prompt"
      menu={props.menu}
      status={readStatus(own)}
      models={own.isPending ? undefined : own.data}
      others={{
        harnesses: catalog.isSuccess ? catalog.data.harnesses : [],
        failed: catalog.isError,
        retry: () => void catalog.refetch(),
      }}
      value={pendingOr(setModel, (variables) => variables.model) ?? row()?.model ?? null}
      effort={setEffort.isPending ? pendingOr(setEffort, (variables) => variables.effort) : (row()?.effort ?? null)}
      switchBlocked={props.running || switchHarness.isPending}
      history={pane.chat().messages()}
      announce={announce}
      registerLayer={layers.register}
      onRetry={() => void own.refetch()}
      onModelChange={(model) => setModel.mutateAsync({sessionId: props.sessionId, model})}
      onEffortChange={(effort) => setEffort.mutateAsync({sessionId: props.sessionId, effort})}
      onSwitchHarness={(target) => switchHarness.mutateAsync(target)}
    />
  )
}

export function SessionModelPrompt(props: SessionModelPromptProps): JSX.Element {
  return (
    <Suspense>
      <SessionModelSelector sessionId={props.sessionId} menu={props.menu} running={props.running} />
    </Suspense>
  )
}
