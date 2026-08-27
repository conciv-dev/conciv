import type {JSX} from 'solid-js'
import type {MessagePart, ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {partIsModelOnly} from '../primitives/message-part/part-visibility.js'

export type ToolCallPartWithParent = ToolCallPart & {metadata?: {parentToolCallId?: unknown}}

export function parentToolCallIdOf(part: MessagePart): string | null {
  if (part.type !== 'tool-call') return null
  const withMeta: ToolCallPartWithParent = part
  const parent = withMeta.metadata?.parentToolCallId
  return typeof parent === 'string' ? parent : null
}

export function childCallsFor(parts: ReadonlyArray<MessagePart>, parentId: string): ToolCallPart[] {
  return parts.filter(
    (part): part is ToolCallPart => part.type === 'tool-call' && parentToolCallIdOf(part) === parentId,
  )
}

export type Turn = {key: string; role: UIMessage['role']; parts: MessagePart[]; start: number; end: number}

export function coalesceTurns(messages: ReadonlyArray<UIMessage>): Turn[] {
  return messages.reduce<Turn[]>((turns, message, index) => {
    const last = turns.at(-1)
    if (message.role === 'assistant' && last?.role === 'assistant') {
      return [...turns.slice(0, -1), {...last, parts: [...last.parts, ...message.parts], end: index}]
    }
    return [...turns, {key: message.id, role: message.role, parts: [...message.parts], start: index, end: index}]
  }, [])
}

type TurnBounds = {first: UIMessage; start: number; end: number}

function turnBounds(messages: ReadonlyArray<UIMessage>): TurnBounds[] {
  const bounds: TurnBounds[] = []
  messages.forEach((message, index) => {
    const last = bounds.at(-1)
    if (last && message.role === 'assistant' && last.first.role === 'assistant') {
      last.end = index
      return
    }
    bounds.push({first: message, start: index, end: index})
  })
  return bounds
}

function sourceUnchanged(
  bound: TurnBounds,
  prevMessages: ReadonlyArray<UIMessage>,
  messages: ReadonlyArray<UIMessage>,
): boolean {
  return messages
    .slice(bound.start, bound.end + 1)
    .every((message, offset) => prevMessages[bound.start + offset] === message)
}

function buildTurn(messages: ReadonlyArray<UIMessage>, bound: TurnBounds): Turn {
  return {
    key: bound.first.id,
    role: bound.first.role,
    parts: messages.slice(bound.start, bound.end + 1).flatMap((message) => message.parts),
    start: bound.start,
    end: bound.end,
  }
}

export function diffTurns(
  prevTurns: ReadonlyArray<Turn>,
  prevMessages: ReadonlyArray<UIMessage>,
  messages: ReadonlyArray<UIMessage>,
): Turn[] {
  return turnBounds(messages).map((bound, index) => {
    const prev = prevTurns[index]
    if (prev && prev.start === bound.start && prev.end === bound.end && sourceUnchanged(bound, prevMessages, messages))
      return prev
    return buildTurn(messages, bound)
  })
}

export type GroupKey = `group-${string}`
export type GroupPath = readonly GroupKey[]

export type GroupByContext = {toolEntries?: ReadonlyArray<ToolCardEntry>}

export type Grouper = (parts: ReadonlyArray<MessagePart>, context: GroupByContext) => ReadonlyArray<GroupPath | null>

export type Grouping = {grouper: Grouper; context: GroupByContext}

export type GroupNodeGroup = {
  type: 'group'
  key: GroupKey
  nodeKey: string
  idKey: string | undefined
  indices: readonly number[]
  children: readonly GroupNode[]
}

export type GroupNodePart = {
  type: 'part'
  index: number
  nodeKey: string
  idKey: string | undefined
}

export type GroupNode = GroupNodeGroup | GroupNodePart

export type GroupRenderProps = {
  node: GroupNodeGroup
  parts: () => readonly MessagePart[]
  resultFor: (toolCallId: string) => ToolResultPart | undefined
  streaming: boolean
  folded?: boolean
  children?: JSX.Element
}

export type GroupEntry = {key: GroupKey; render: (props: GroupRenderProps) => JSX.Element}

export const CHAIN_GROUP_KEY: GroupKey = 'group-chain'
export const PAGE_SESSION_GROUP_KEY: GroupKey = 'group-page-session'

export const ROOT_PATH: GroupPath = []
export const CHAIN_PATH: GroupPath = [CHAIN_GROUP_KEY]
export const PAGE_SESSION_PATH: GroupPath = [PAGE_SESSION_GROUP_KEY]

type GroupPartType = MessagePart['type'] | 'standalone-tool-call'

export type PartTypePaths = Partial<Readonly<Record<GroupPartType, GroupPath>>>

export function standaloneToolNames(context: GroupByContext): ReadonlySet<string> {
  const entries = context.toolEntries ?? []
  const names = [...new Set(entries.flatMap((entry) => [...entry.names]))]
  return new Set(names.filter((name) => entries.find((entry) => entry.names.includes(name))?.display === 'standalone'))
}

function isBlankTextual(part: MessagePart): boolean {
  if (part.type === 'text' || part.type === 'thinking') return part.content.trim().length === 0
  return false
}

function partTypeKey(part: MessagePart, standalone: ReadonlySet<string>): GroupPartType {
  if (part.type === 'tool-call' && standalone.has(part.name)) return 'standalone-tool-call'
  return part.type
}

function typePath(map: PartTypePaths, part: MessagePart, standalone: ReadonlySet<string>): GroupPath | null {
  const key = partTypeKey(part, standalone)
  if (key === 'standalone-tool-call') return map[key] ?? map['tool-call'] ?? null
  return map[key] ?? null
}

export function groupPartByType(map: PartTypePaths): Grouper {
  return (parts, context) => {
    const standalone = standaloneToolNames(context)
    return parts.map((part) => {
      if (isBlankTextual(part) || partIsModelOnly(part)) return null
      return typePath(map, part, standalone)
    })
  }
}

export const defaultGrouper: Grouper = groupPartByType({
  text: ROOT_PATH,
  image: ROOT_PATH,
  thinking: CHAIN_PATH,
  'tool-call': CHAIN_PATH,
  'standalone-tool-call': ROOT_PATH,
})

type BuildFrame = {
  key: GroupKey
  nodeKey: string
  indices: number[]
  children: GroupNode[]
  nextChildIndex: number
  claimed: Set<string>
}

function makeFrame(key: GroupKey, nodeKey: string): BuildFrame {
  return {key, nodeKey, indices: [], children: [], nextChildIndex: 0, claimed: new Set()}
}

function makeChildNodeKey(parent: BuildFrame): string {
  const index = parent.nextChildIndex
  parent.nextChildIndex = index + 1
  return parent.nodeKey === '' ? String(index) : `${parent.nodeKey}.${index}`
}

function claimIdKey(frame: BuildFrame, id: string | undefined): string | undefined {
  if (id === undefined || frame.claimed.has(id)) return undefined
  frame.claimed.add(id)
  return `id:${id}`
}

function closeTop(stack: BuildFrame[], partIds: ReadonlyArray<string | undefined> | undefined): void {
  const closing = stack.pop()
  const parent = stack.at(-1)
  if (!closing || !parent) return
  const first = closing.indices[0]
  parent.children.push({
    type: 'group',
    key: closing.key,
    nodeKey: closing.nodeKey,
    idKey: claimIdKey(parent, first === undefined ? undefined : partIds?.[first]),
    indices: closing.indices,
    children: closing.children,
  })
}

function commonDepth(stack: ReadonlyArray<BuildFrame>, path: GroupPath): number {
  let common = 0
  while (common < stack.length - 1 && common < path.length) {
    const frame = stack[common + 1]
    if (!frame || frame.key !== path[common]) return common
    common += 1
  }
  return common
}

function openPath(stack: BuildFrame[], path: GroupPath): void {
  while (stack.length - 1 < path.length) {
    const parent = stack.at(-1)
    const key = path[stack.length - 1]
    if (!parent || key === undefined) return
    stack.push(makeFrame(key, makeChildNodeKey(parent)))
  }
}

export function buildGroupTree(
  paths: ReadonlyArray<GroupPath | null>,
  partIds?: ReadonlyArray<string | undefined>,
): readonly GroupNode[] {
  const root = makeFrame(CHAIN_GROUP_KEY, '')
  const stack: BuildFrame[] = [root]
  paths.forEach((path, index) => {
    if (path === null || path === undefined) return
    const common = commonDepth(stack, path)
    while (stack.length - 1 > common) closeTop(stack, partIds)
    openPath(stack, path)
    const top = stack.at(-1)
    if (!top) return
    top.children.push({type: 'part', index, nodeKey: makeChildNodeKey(top), idKey: claimIdKey(top, partIds?.[index])})
    for (const frame of stack.slice(1)) frame.indices.push(index)
  })
  while (stack.length > 1) closeTop(stack, partIds)
  return root.children
}

function partIdOf(part: MessagePart): string | undefined {
  return part.type === 'tool-call' && part.id.length > 0 ? part.id : undefined
}

export function groupParts(
  parts: ReadonlyArray<MessagePart>,
  grouper: Grouper,
  context: GroupByContext,
): readonly GroupNode[] {
  return buildGroupTree(grouper(parts, context), parts.map(partIdOf))
}

export function lastGroupedIndex(nodes: readonly GroupNode[]): number {
  const last = nodes.at(-1)
  if (!last) return -1
  return last.type === 'part' ? last.index : (last.indices.at(-1) ?? -1)
}

export function groupEntryFor(entries: ReadonlyArray<GroupEntry>, key: GroupKey): GroupEntry | undefined {
  return entries.find((entry) => entry.key === key)
}

export function isReplyText(part: MessagePart): boolean {
  return part.type === 'text' && part.content.trim().length > 0
}

export type ResultPairing = {byCallId: Map<string, ToolResultPart>; hiddenResultIds: Set<string>}

export function pairResults(parts: ReadonlyArray<MessagePart>): ResultPairing {
  const callIds = new Set(parts.flatMap((part) => (part.type === 'tool-call' && part.id.length > 0 ? [part.id] : [])))
  const results = parts.filter(
    (part): part is ToolResultPart => part.type === 'tool-result' && part.toolCallId.length > 0,
  )
  const byCallId = new Map(results.map((part) => [part.toolCallId, part]))
  const hiddenResultIds = new Set(results.map((part) => part.toolCallId).filter((id) => callIds.has(id)))
  return {byCallId, hiddenResultIds}
}
