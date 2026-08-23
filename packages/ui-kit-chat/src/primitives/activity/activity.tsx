import {createContext, createMemo, useContext, type Accessor, type JSX, type ParentProps} from 'solid-js'
import type {ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import {keyBy} from 'es-toolkit'
import {coalesceTurns, type Turn} from '../../store/grouping.js'
import {activeCallInParts} from '../../store/active-call.js'

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

function resultsById(messages: ReadonlyArray<UIMessage>): Record<string, ToolResultPart> {
  const results = messages
    .flatMap((message) => message.parts)
    .filter((part): part is ToolResultPart => part.type === 'tool-result' && part.toolCallId.length > 0)
  return keyBy(results, (part) => part.toolCallId)
}

function lastRunningCall(
  turn: Turn | undefined,
  resultFor: (id: string) => ToolResultPart | undefined,
): ToolCallPart | null {
  if (!turn || turn.role !== 'assistant') return null
  return activeCallInParts(turn.parts, resultFor)
}

type ActivityRootProps = ParentProps<{
  messages: UIMessage[]
  live?: boolean
  label?: ActivityLabeler
}>

function Root(props: ActivityRootProps): JSX.Element {
  const turns = createMemo(() => coalesceTurns(props.messages))
  const results = createMemo(() => resultsById(props.messages))
  const resultFor = (toolCallId: string) => results()[toolCallId]
  const activeCall = createMemo(() => lastRunningCall(turns().at(-1), resultFor))
  const state: ActivityState = {
    turns,
    resultFor,
    live: () => props.live ?? false,
    label: (part) => (props.label ?? ((call: ToolCallPart) => call.name))(part),
    isLastTurn: (turn) => turns().at(-1)?.key === turn.key,
    activeCall,
  }
  return <ActivityContext.Provider value={state}>{props.children}</ActivityContext.Provider>
}

export const Activity = {Root}
