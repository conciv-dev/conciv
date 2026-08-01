import {createMemo} from 'solid-js'
import {useMutation} from '@tanstack/solid-query'
import {pairResults} from '@conciv/ui-kit-chat'
import {builtinToolCards, nowTitle} from '@conciv/ui-kit-chat-tools'
import type {MessagePart, ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import type {ChatSession} from './use-send-pipeline.js'
import type {RpcClient} from '@conciv/contract'
import type {ToolCardEntry, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import {collectToolRenderers} from '@conciv/extension'
import type {ExtensionInstance} from '../extension/extension-slots.js'
import {makeConcivUiCard} from './conciv-ui-card.js'
import type {Notify} from './notify.js'
import {foldToolDurations} from './tool-durations.js'

const ANSWER_GONE = 'That question is no longer waiting for an answer.'

type DurationFold = {startedAt: Map<string, number>; durations: Record<string, number>}

export type ToolCardsDeps = {
  rpc: RpcClient
  sessionId: () => string
  instances: ExtensionInstance[]
  harnessId: () => string
  chat: ChatSession
  notify: Notify
}

export type ToolCards = {
  toolCtx: ToolViewCtx
  tools: () => ToolCardEntry[]
  nowTitleText: () => string | null
}

function callSettled(part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  return result?.state === 'complete' || result?.state === 'error' || part.output !== undefined
}

function activeCallTitle(parts: ReadonlyArray<MessagePart>, titleByName: Record<string, string>): string | null {
  const {byCallId} = pairResults(parts)
  let title: string | null = null
  for (const part of parts) {
    if (part.type !== 'tool-call' || !part.id) continue
    title = callSettled(part, byCallId.get(part.id)) ? title : nowTitle(part, titleByName)
  }
  return title
}

function streamingTitle(messages: ReadonlyArray<UIMessage>, titles: Record<string, string>): string | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  return activeCallTitle(last.parts, titles)
}

export function useToolCards(deps: ToolCardsDeps): ToolCards {
  const seed: DurationFold = {startedAt: new Map(), durations: {}}
  const fold = createMemo<DurationFold>(
    (previous) => ({
      startedAt: previous.startedAt,
      durations: foldToolDurations(deps.chat.messages(), previous.startedAt, Date.now, previous.durations),
    }),
    seed,
  )

  const uiReply = useMutation(() => ({
    mutationFn: (input: {toolCallId: string; value: UiAnswerValue}) =>
      deps.rpc.chat.uiReply({sessionId: deps.sessionId(), toolCallId: input.toolCallId, value: input.value}),
    onError: () => deps.notify(ANSWER_GONE),
  }))

  const concivUiEntry: ToolCardEntry = {
    names: ['conciv_ui'],
    render: makeConcivUiCard({reply: (toolCallId, value) => uiReply.mutate({toolCallId, value})}),
  }

  const tools = (): ToolCardEntry[] => [
    concivUiEntry,
    ...collectToolRenderers(deps.instances.map((instance) => instance.extension)),
    ...builtinToolCards,
  ]

  const streamTitles = (): Record<string, string> =>
    Object.fromEntries(
      tools().flatMap((entry) => (entry.streamTitle ? entry.names.map((name) => [name, entry.streamTitle ?? '']) : [])),
    )

  const toolCtx: ToolViewCtx = {
    apiBase: '',
    harnessId: deps.harnessId(),
    sendMessage: (text) => void deps.chat.sendMessage(text),
    respondApproval: (approvalId, approved) => {
      void deps.rpc.chat.permissionDecision({approvalId, approved}).catch(() => {})
    },
    durationFor: (toolCallId) => fold().durations[toolCallId],
  }

  return {
    toolCtx,
    tools,
    nowTitleText: () =>
      deps.chat.status() === 'streaming' ? streamingTitle(deps.chat.messages(), streamTitles()) : null,
  }
}
