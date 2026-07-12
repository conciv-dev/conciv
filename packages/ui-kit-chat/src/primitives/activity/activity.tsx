import {createContext, createMemo, useContext, type Accessor, type JSX, type ParentProps} from 'solid-js'
import type {ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import {coalesceTurns, type Turn} from '../../store/grouping.js'
import {toolStatus} from '../tools/tool-status.js'

export type ActivityLabeler = (part: ToolCallPart) => string

type ActivityState = {
  turns: Accessor<Turn[]>
  resultFor: (toolCallId: string) => ToolResultPart | undefined
  live: Accessor<boolean>
  label: ActivityLabeler
  isLastTurn: (turn: Turn) => boolean
  activeCall: Accessor<ToolCallPart | null>
}

const ActivityContext = createContext<ActivityState>()

export function useActivity(): ActivityState {
  const context = useContext(ActivityContext)
  if (!context) throw new Error('Activity.* must be used within an Activity.Root')
  return context
}

function resultsById(messages: ReadonlyArray<UIMessage>): Map<string, ToolResultPart> {
  const map = new Map<string, ToolResultPart>()
  for (const part of messages.flatMap((message) => message.parts)) {
    if (part.type === 'tool-result' && part.toolCallId) map.set(part.toolCallId, part)
  }
  return map
}

function lastRunningCall(
  turn: Turn | undefined,
  resultFor: (id: string) => ToolResultPart | undefined,
): ToolCallPart | null {
  if (!turn || turn.role !== 'assistant') return null
  return turn.parts.reduce<ToolCallPart | null>((active, part) => {
    if (part.type !== 'tool-call' || !part.id) return active
    return toolStatus(part, resultFor(part.id)) === 'running' ? part : active
  }, null)
}

type ActivityRootProps = ParentProps<{
  messages: UIMessage[]
  live?: boolean
  label?: ActivityLabeler
}>

function Root(props: ActivityRootProps): JSX.Element {
  const turns = createMemo(() => coalesceTurns(props.messages))
  const results = createMemo(() => resultsById(props.messages))
  const resultFor = (toolCallId: string) => results().get(toolCallId)
  const state: ActivityState = {
    turns,
    resultFor,
    live: () => props.live ?? false,
    label: (part) => (props.label ?? ((call: ToolCallPart) => call.name))(part),
    isLastTurn: (turn) => turns().at(-1)?.key === turn.key,
    activeCall: createMemo(() => lastRunningCall(turns().at(-1), resultFor)),
  }
  return <ActivityContext.Provider value={state}>{props.children}</ActivityContext.Provider>
}

export const Activity = {Root}
