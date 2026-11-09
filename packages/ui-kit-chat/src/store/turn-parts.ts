import {createMemo, createSelector, untrack, type Accessor} from 'solid-js'
import {keyArray} from '@solid-primitives/keyed'
import {keyBy} from 'es-toolkit'
import type {ChatPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {Turn} from './grouping.js'

const CALL_PREFIX = 'call:'
const RESULT_PREFIX = 'result:'

type PartItem = {key: string; part: Accessor<ChatPart>; index: Accessor<number>}

export function createTurnParts(turn: Accessor<Turn>): {
  items: Accessor<readonly PartItem[]>
  partAt: (index: number) => ChatPart | undefined
  resultFor: (toolCallId: string) => ToolResultPart | undefined
  hidesResult: (toolCallId: string) => boolean
} {
  const items = createMemo<readonly PartItem[]>(
    keyArray(
      () => turn().parts,
      partKey,
      (part, index): PartItem => ({key: untrack(() => partKey(part(), index())), part, index}),
    ),
    [],
    {equals: sameItems},
  )
  const results = createMemo(() => idsByPrefix(items(), RESULT_PREFIX))
  const calls = createMemo(() => idsByPrefix(items(), CALL_PREFIX))
  const hasResult = createSelector(results, holds)
  const hasCall = createSelector(calls, holds)
  return {
    items,
    partAt: (index) => items()[index]?.part(),
    resultFor: (toolCallId) => {
      if (!hasResult(toolCallId)) return undefined
      const part = untrack(results)[toolCallId]?.part()
      return part?.type === 'tool-result' ? part : undefined
    },
    hidesResult: hasCall,
  }
}

function partKey(part: ChatPart, index: number): string {
  if (part.type === 'tool-call' && part.id.length > 0) return `${CALL_PREFIX}${part.id}`
  if (part.type === 'tool-result' && part.toolCallId.length > 0) return `${RESULT_PREFIX}${part.toolCallId}`
  return `p${index}`
}

function sameItems(previous: readonly PartItem[], next: readonly PartItem[]): boolean {
  return previous.length === next.length && next.every((item, index) => item === previous[index])
}

function holds(toolCallId: string, record: Record<string, PartItem>): boolean {
  return Object.hasOwn(record, toolCallId)
}

function idsByPrefix(items: readonly PartItem[], prefix: string): Record<string, PartItem> {
  return keyBy(
    items.filter((item) => item.key.startsWith(prefix)),
    (item) => item.key.slice(prefix.length),
  )
}
