import {useMutation, type CreateMutationResult} from '@tanstack/solid-query'
import type {ChatSession} from '@conciv/client'
import type {RpcClient} from '@conciv/contract'
import type {MultimodalContent} from '@tanstack/ai-client'
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
  compact: CreateMutationResult<unknown, Error, void, unknown>
  compacting: () => boolean
  visibleError: () => Error | undefined
  onSend: (content: string | MultimodalContent) => Promise<void>
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
    onError: () =>
      notifyUnlessOffline(deps.reachability.sustainedOffline(), () =>
        deps.notices.notify('Compaction failed. The session may be busy. Try again in a moment.'),
      ),
    onSettled: () => {
      deps.appData.invalidateSessions()
      void deps.refetchMarkers()
    },
  }))
  const compacting = () => compact.isPending

  const visibleError = (): Error | undefined => {
    const error = deps.reachability.sustainedOffline() ? undefined : deps.chat.error()
    return error && error.message !== 'stopped' ? error : undefined
  }

  const onSend = async (content: string | MultimodalContent): Promise<void> => {
    const verdict = checkSend(content, {
      busy: compacting(),
      connected: deps.chat.connectionStatus() === 'connected',
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

  return {uiReply, compact, compacting, visibleError, onSend, onSendError}
}
