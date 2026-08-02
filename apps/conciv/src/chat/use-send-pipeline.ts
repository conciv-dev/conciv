import {createEffect, createMemo, createSignal, on, type Accessor} from 'solid-js'
import {useChatSession} from '@conciv/client'
import type {MultimodalContent} from '@tanstack/ai-client'
import type {RpcClient} from '@conciv/contract'
import type {ComposerHandlers} from '@conciv/ui-kit-chat'
import type {PaneContextValue} from '../app/pane-context.js'
import {notify} from '../shell/notices.js'
import type {ComposerStateApi} from './composer-state.js'
import {checkSend} from './send-checks.js'
import {makeSendGuard, type SendGuard} from './send-guard.js'
import type {PaneDraft} from './use-pane-draft.js'

const SEND_FAILED = 'Couldn’t send that message. It is back in the composer.'
const STEER_FAILED = 'Steering failed. The message is still queued. Try again.'

export type ChatSession = ReturnType<typeof useChatSession>

type Delivery = {attempt: number; streamed: boolean}

const NOTHING_DELIVERED: Delivery = {attempt: 0, streamed: false}

function foldDelivery(previous: Delivery, attempt: number, streaming: boolean): Delivery {
  if (previous.attempt !== attempt) return {attempt, streamed: streaming}
  return {attempt, streamed: previous.streamed || streaming}
}

export type SendPipelineDeps = {
  rpc: RpcClient
  sessionId: () => string
  pane: PaneContextValue
  draft: PaneDraft
  composer: Accessor<ComposerStateApi | null>
  focusComposer: () => void
  busy: () => boolean
  invalidateSessions: () => void
}

export type SendPipeline = {
  chat: ChatSession
  guard: SendGuard
  handlers: ComposerHandlers
  status: () => string
  thinking: () => boolean
  working: () => boolean
  generating: () => boolean
  disconnected: () => boolean
  visibleError: () => Error | undefined
}

export function useSendPipeline(deps: SendPipelineDeps): SendPipeline {
  const [forceSend, setForceSend] = createSignal(false)
  const [attempt, setAttempt] = createSignal(0)
  const [rejection, setRejection] = createSignal<Error | null>(null, {equals: false})

  const chat = useChatSession({
    rpc: deps.rpc,
    sessionId: deps.sessionId(),
    connection: {force: () => forceSend()},
    onError: (error) => setRejection(error),
  })

  const thinking = (): boolean => chat.status() === 'submitted'
  const streaming = (): boolean => chat.status() === 'streaming'
  const working = (): boolean => thinking() || streaming()
  const disconnected = (): boolean => chat.connectionStatus() !== 'connected'

  const delivery = createMemo<Delivery>((previous) => foldDelivery(previous, attempt(), streaming()), NOTHING_DELIVERED)

  const dispatch = async (content: string | MultimodalContent, force: boolean): Promise<void> => {
    setForceSend(force)
    setAttempt((counted) => counted + 1)
    const sending = chat.sendMessage(content).finally(() => setForceSend(false))
    await deps.draft.noteSent()
    await sending
    deps.draft.settleSent()
  }

  const guard = makeSendGuard({
    attached: deps.pane.attached,
    delivered: () => delivery().streamed,
    snapshot: () => deps.composer()?.snapshotDraft() ?? null,
    restore: (saved) => deps.composer()?.restoreDraft(saved),
    clearDraft: () => deps.composer()?.clearDraft(),
    grabs: deps.pane.grabStore.grabs,
    stageGrabs: deps.pane.grabStore.stageAll,
    clearGrabs: deps.pane.grabStore.clear,
    focusComposer: deps.focusComposer,
    detach: () => deps.rpc.sessions.attachDetach({sessionId: deps.sessionId()}).then(deps.invalidateSessions),
    dispatch,
    onFailed: () => notify(SEND_FAILED, {tone: 'danger'}),
  })

  createEffect(
    on(rejection, (error) => {
      if (!error) return
      guard.rejected(error)
    }),
  )

  const beforeSend = (content: string | MultimodalContent): boolean => {
    const verdict = checkSend(content, {busy: deps.busy(), connected: chat.connectionStatus() === 'connected'})
    if (verdict.ok) return guard.beforeSend(content)
    if (verdict.message !== null) notify(verdict.message, {tone: verdict.tone})
    return false
  }

  const handlers: ComposerHandlers = {
    beforeSend,
    onSend: guard.onSend,
    onCancel: () => {
      chat.stop()
      void deps.rpc.sessions.stop({sessionId: deps.sessionId()}).catch(() => {})
    },
    onSteer: () => deps.rpc.sessions.stop({sessionId: deps.sessionId()}),
    onSteerError: () => notify(STEER_FAILED),
  }

  return {
    chat,
    guard,
    handlers,
    status: chat.status,
    thinking,
    working,
    generating: chat.sessionGenerating,
    disconnected,
    visibleError: () => {
      const error = chat.error()
      return error && error.message !== 'stopped' ? error : undefined
    },
  }
}
