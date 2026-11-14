import {createMemo} from 'solid-js'
import {useMutation, type CreateMutationResult, type ChatSession} from '@conciv/client'
import type {RpcClient} from '@conciv/contract'
import type {SendContent} from '@conciv/protocol/chat-message-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import type {AppData} from '../data/app-data.js'
import type {EngineNotices} from '../shell/notice-context.js'
import {checkSend, type SendVerdict} from './send-checks.js'

type SendRejection = {rejected: true; message: string | null; tone: 'info' | 'warn'}

function sendRejection(verdict: Extract<SendVerdict, {ok: false}>): SendRejection {
  return {rejected: true, message: verdict.message, tone: verdict.tone}
}

function isSendRejection(failure: unknown): failure is SendRejection {
  return typeof failure === 'object' && failure !== null && 'rejected' in failure && failure.rejected === true
}

function failureMessage(failure: unknown): string {
  if (failure instanceof Error && failure.message.length > 0) return failure.message
  return 'The message could not be sent.'
}

function notifyUnlessOffline(sustainedOffline: boolean, notify: () => void): void {
  if (sustainedOffline) return
  notify()
}

type CompactContext = {resolving: Error | undefined}

type RecordedFailure = {runId: string; message: string; retryable: boolean}

function sameFailure(previous: RecordedFailure | undefined, next: RecordedFailure | undefined): boolean {
  return (
    previous?.runId === next?.runId && previous?.message === next?.message && previous?.retryable === next?.retryable
  )
}

function recordedFailure(chat: ChatSession): RecordedFailure | undefined {
  const lifecycle = chat.runSource()?.lifecycle
  if (lifecycle === undefined || lifecycle.error === null) return undefined
  if (lifecycle.phase !== 'failed' && lifecycle.phase !== 'completed') return undefined
  return {runId: lifecycle.runId, message: lifecycle.error, retryable: lifecycle.phase === 'failed'}
}

type PaneMessagingDeps = {
  rpc: RpcClient
  sessionId: string
  chat: ChatSession
  appData: AppData
  reachability: EngineNotices['reachability']
  notices: EngineNotices['notices']
  refetchMarkers: () => Promise<unknown>
}

export type PaneMessaging = {
  uiReply: CreateMutationResult<unknown, Error, {toolCallId: string; value: UiAnswerValue}, unknown>
  compact: CreateMutationResult<unknown, Error, void, CompactContext>
  compacting: () => boolean
  visibleError: () => Error | undefined
  retryable: () => boolean
  onSend: (content: string | SendContent) => Promise<void>
  onSendError: (failure: unknown) => void
}

export function usePaneMessaging(deps: PaneMessagingDeps): PaneMessaging {
  const uiReply = useMutation(() => ({
    mutationFn: (input: {toolCallId: string; value: UiAnswerValue}) =>
      deps.rpc.chat.uiReply({sessionId: deps.sessionId, toolCallId: input.toolCallId, value: input.value}),
    onError: () =>
      notifyUnlessOffline(deps.reachability.sustainedOffline(), () =>
        deps.notices.notify('That question is no longer waiting for an answer.'),
      ),
  }))

  const compact = useMutation(() => ({
    mutationFn: () => deps.rpc.sessions.compact({sessionId: deps.sessionId}),
    onMutate: (): CompactContext => ({resolving: runError()}),
    onError: () =>
      notifyUnlessOffline(deps.reachability.sustainedOffline(), () =>
        deps.notices.notify('Compaction failed. The session may be busy. Try again in a moment.'),
      ),
    onSettled: () => {
      void deps.appData.invalidateSession(deps.sessionId)
      void deps.refetchMarkers()
    },
  }))
  const compacting = () => compact.isPending

  const lastRunFailure = createMemo(() => recordedFailure(deps.chat), undefined, {equals: sameFailure})
  const failureError = createMemo(() => {
    const recorded = lastRunFailure()
    return recorded === undefined ? undefined : new Error(recorded.message)
  })
  const recordedError = (): Error | undefined => (deps.chat.runInProgress() ? undefined : failureError())
  const runError = (): Error | undefined => deps.chat.error() ?? recordedError()
  const retryable = (): boolean => deps.chat.error() !== undefined || lastRunFailure()?.retryable === true

  const visibleError = (): Error | undefined => {
    const error = deps.reachability.sustainedOffline() ? undefined : runError()
    if (compact.isSuccess && compact.context?.resolving === error) return undefined
    return error && error.message !== 'stopped' ? error : undefined
  }

  const onSend = async (content: string | SendContent): Promise<void> => {
    const verdict = checkSend(content, {
      busy: compacting(),
      reachable: deps.reachability.online(),
    })
    if (!verdict.ok) throw sendRejection(verdict)
    await deps.chat.sendMessage(content)
  }

  const onSendError = (failure: unknown): void => {
    if (isSendRejection(failure)) {
      if (failure.message) deps.notices.notify(failure.message, {tone: failure.tone === 'warn' ? 'warn' : 'info'})
      return
    }
    notifyUnlessOffline(deps.reachability.sustainedOffline(), () =>
      deps.notices.notify(failureMessage(failure), {tone: 'danger'}),
    )
  }

  return {uiReply, compact, compacting, visibleError, retryable, onSend, onSendError}
}
