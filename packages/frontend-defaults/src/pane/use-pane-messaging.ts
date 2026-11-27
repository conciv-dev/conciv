import {createMemo} from 'solid-js'
import {z} from 'zod'
import {EvlogError} from 'evlog'
import {useMutation, type CreateMutationResult, type ChatSession} from '@conciv/client'
import type {EngineClient} from '@conciv/client'
import type {QueuedMessage, SendContent} from '@conciv/types/chat-message-types'
import type {UiAnswerValue} from '@conciv/types/ui-types'
import type {AppData} from '../data/app-data.js'
import {useLiveSessions} from '../app/context.js'
import type {EngineNotices} from '../shell/notice-context.js'
import {checkSend, checkSendState, type SendState, type SendVerdict} from './send-checks.js'
import {SESSION_DELETED_MESSAGE, sessionDeleted} from './run-error-row.js'
import {errorFix, rpcErrorCode, SESSION_NOT_FOUND_MESSAGE} from '../shell/rpc-error-message.js'
import {paneErrors} from './errors.js'

const RefusalToneSchema = z.enum(['info', 'warn']).catch('warn')

function sendRejection(verdict: Extract<SendVerdict, {ok: false}>): EvlogError {
  if (verdict.message === null) return paneErrors.SEND_SKIPPED()
  return paneErrors.SEND_REFUSED({message: verdict.message, internal: {tone: verdict.tone}})
}

function sendRefusal(failure: unknown): {message: string; tone: 'info' | 'warn'} | undefined {
  if (!EvlogError.isEvlogError(failure)) return undefined
  if (failure.code === paneErrors.SEND_SKIPPED.code) return {message: '', tone: 'info'}
  if (failure.code !== paneErrors.SEND_REFUSED.code) return undefined
  return {message: failure.message, tone: RefusalToneSchema.parse(failure.internal?.tone)}
}

function compactFailureMessage(error: unknown): string {
  if (rpcErrorCode(error) === 'NOT_FOUND') return SESSION_NOT_FOUND_MESSAGE
  return 'Compaction failed. The session may be busy. Try again in a moment.'
}

const ANSWER_UNSENT = 'Your answer was not sent.'

function failureMessage(failure: unknown): string {
  if (sessionDeleted(failure)) return SESSION_DELETED_MESSAGE
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
  rpc: EngineClient
  sessionId: string
  chat: ChatSession
  appData: AppData
  reachability: EngineNotices['reachability']
  notices: EngineNotices['notices']
  refetchMarkers: () => Promise<unknown>
}

export type PaneMessaging = {
  onAnswer: (toolCallId: string, value: UiAnswerValue) => Promise<void>
  compact: CreateMutationResult<unknown, Error, void, CompactContext>
  compacting: () => boolean
  visibleError: () => Error | undefined
  retryable: () => boolean
  onSend: (content: string | SendContent) => Promise<void>
  onSendError: (failure: unknown) => void
  onSteer: () => void
  onSteerError: (failure: unknown, item: QueuedMessage) => void
  resendAllowed: () => boolean
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
    onError: (error) =>
      notifyUnlessOffline(deps.reachability.sustainedOffline(), () =>
        deps.notices.notify(compactFailureMessage(error)),
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
    return recorded === undefined ? undefined : paneErrors.RUN_FAILED({message: recorded.message})
  })
  const recordedError = (): Error | undefined => (deps.chat.runInProgress() ? undefined : failureError())
  const runError = (): Error | undefined => deps.chat.error() ?? recordedError()
  const retryable = (): boolean => deps.chat.error() !== undefined || lastRunFailure()?.retryable === true

  const visibleError = (): Error | undefined => {
    const error = deps.reachability.sustainedOffline() ? undefined : runError()
    if (compact.isSuccess && compact.context?.resolving === error) return undefined
    return error
  }

  const sendState = (): SendState => ({
    busy: compacting(),
    reachable: deps.reachability.online(),
    locked: deps.reachability.locked(),
  })

  const resendAllowed = (): boolean => checkSendState({...sendState(), busy: false}).ok

  const onSend = async (content: string | SendContent): Promise<void> => {
    const verdict = checkSend(content, sendState())
    if (!verdict.ok) throw sendRejection(verdict)
    await deps.chat.sendMessage(content).catch((error: unknown) => {
      throw deps.chat.withdrawn() ? paneErrors.SEND_SKIPPED() : error
    })
  }

  const onAnswer = async (toolCallId: string, value: UiAnswerValue): Promise<void> => {
    const verdict = checkSendState(sendState(), ANSWER_UNSENT)
    if (!verdict.ok) {
      const rejection = sendRejection(verdict)
      onSendError(rejection)
      throw rejection
    }
    uiReply.mutate({toolCallId, value})
  }

  const onSteer = (): void => {
    const verdict = checkSendState(sendState())
    if (!verdict.ok) throw sendRejection(verdict)
  }

  const onSendError = (failure: unknown): void => {
    const refusal = sendRefusal(failure)
    if (refusal) {
      if (!refusal.message) return
      notifyUnlessOffline(deps.reachability.sustainedOffline() && deps.reachability.locked() === null, () =>
        deps.notices.notify(refusal.message, {tone: refusal.tone}),
      )
      return
    }
    if (failure === visibleError()) return
    notifyUnlessOffline(deps.reachability.sustainedOffline(), () =>
      deps.notices.notify(failureMessage(failure), {tone: 'danger', description: errorFix(failure)}),
    )
  }

  const liveSessions = useLiveSessions()
  const onSteerError = (failure: unknown, item: QueuedMessage): void => {
    liveSessions.returnSteered(deps.sessionId, deps.chat, item)
    onSendError(failure)
  }

  return {
    onAnswer,
    compact,
    compacting,
    visibleError,
    retryable,
    onSend,
    onSendError,
    onSteer,
    onSteerError,
    resendAllowed,
  }
}
