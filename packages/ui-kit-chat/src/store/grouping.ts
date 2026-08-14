import {uniqBy} from 'es-toolkit'
import type {MessagePart, ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'

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

export type ChainSegment = {kind: 'chain'; indices: number[]}
export type ReplySegment = {kind: 'reply'; index: number}
export type PageSessionSegment = {kind: 'page-session'; indices: number[]}
export type StandaloneSegment = {kind: 'standalone'; index: number}
export type Segment = ChainSegment | ReplySegment | PageSessionSegment | StandaloneSegment

export type GroupingOptions = {
  pageActNames?: ReadonlySet<string>
  pageToolPrefix?: string
  standalone?: (name: string) => boolean
}

const isReplyText = (part: MessagePart): boolean => part.type === 'text' && part.content.trim().length > 0

type PageSessionGrouping = {
  segments: Segment[]
  openCallIds: Set<string>
  pageActNames: ReadonlySet<string>
  pageToolPrefix: string | undefined
  actParentIds: ReadonlySet<string>
  standalone: ((name: string) => boolean) | undefined
}

function foldableParentIds(parts: ReadonlyArray<MessagePart>, pageActNames: ReadonlySet<string>): Set<string> {
  if (pageActNames.size === 0) return new Set()
  const replyIndices = parts.flatMap((part, index) => (isReplyText(part) ? [index] : []))
  const calls = parts.flatMap((part, index) => (part.type === 'tool-call' ? [{call: part, index}] : []))
  const firstIndexByCallId = new Map(
    uniqBy(
      calls.filter(({call}) => call.id.length > 0),
      ({call}) => call.id,
    ).map(({call, index}) => [call.id, index]),
  )
  const actChildren = calls.flatMap(({call, index}) => {
    const parent = parentToolCallIdOf(call)
    return pageActNames.has(call.name) && parent !== null ? [{parent, index}] : []
  })
  const unsplit = uniqBy(actChildren, ({parent}) => parent).filter(({parent, index: childIndex}) => {
    const parentIndex = firstIndexByCallId.get(parent)
    if (parentIndex === undefined) return false
    return !replyIndices.some((replyIndex) => replyIndex > parentIndex && replyIndex < childIndex)
  })
  return new Set(unsplit.map(({parent}) => parent))
}

function toolCallFolds(grouping: PageSessionGrouping, part: ToolCallPart): boolean {
  if (part.state === 'approval-requested') return false
  const parent = parentToolCallIdOf(part)
  if (parent !== null && grouping.openCallIds.has(parent)) return true
  return grouping.pageToolPrefix !== undefined && part.name.startsWith(grouping.pageToolPrefix)
}

function foldsIntoOpenSession(grouping: PageSessionGrouping, part: MessagePart): boolean {
  if (part.type === 'text' || part.type === 'thinking') return true
  if (part.type === 'tool-call') return toolCallFolds(grouping, part)
  if (part.type === 'tool-result')
    return typeof part.toolCallId === 'string' && grouping.openCallIds.has(part.toolCallId)
  return false
}

function openSessionOf(segments: ReadonlyArray<Segment>): PageSessionSegment | undefined {
  const last = segments.at(-1)
  return last?.kind === 'page-session' ? last : undefined
}

function placePageAct(grouping: PageSessionGrouping, part: ToolCallPart, index: number): void {
  if (part.id) grouping.openCallIds.add(part.id)
  const session = openSessionOf(grouping.segments)
  if (session) {
    session.indices.push(index)
    return
  }
  grouping.segments.push({kind: 'page-session', indices: [index]})
}

function placeInChain(grouping: PageSessionGrouping, index: number): void {
  grouping.openCallIds.clear()
  const last = grouping.segments.at(-1)
  if (last?.kind === 'chain') {
    last.indices.push(index)
    return
  }
  grouping.segments.push({kind: 'chain', indices: [index]})
}

function placeReply(grouping: PageSessionGrouping, index: number): void {
  grouping.openCallIds.clear()
  grouping.segments.push({kind: 'reply', index})
}

function isStandaloneCall(grouping: PageSessionGrouping, part: MessagePart): boolean {
  return part.type === 'tool-call' && (grouping.standalone?.(part.name) ?? false)
}

function placeStandalone(grouping: PageSessionGrouping, index: number): void {
  grouping.openCallIds.clear()
  grouping.segments.push({kind: 'standalone', index})
}

function foldResultIntoTrailingChain(grouping: PageSessionGrouping, index: number): void {
  const last = grouping.segments.at(-1)
  if (last?.kind === 'chain') last.indices.push(index)
}

function sessionMemberCall(grouping: PageSessionGrouping, part: MessagePart): ToolCallPart | undefined {
  if (part.type !== 'tool-call' || part.state === 'approval-requested') return undefined
  return grouping.pageActNames.has(part.name) || grouping.actParentIds.has(part.id) ? part : undefined
}

function foldIntoSession(
  grouping: PageSessionGrouping,
  session: PageSessionSegment,
  part: MessagePart,
  index: number,
): void {
  if (part.type === 'tool-call' && part.id) grouping.openCallIds.add(part.id)
  session.indices.push(index)
}

function placeSegmentPart(grouping: PageSessionGrouping, part: MessagePart, index: number): void {
  if (isReplyText(part)) {
    placeReply(grouping, index)
    return
  }
  if (isStandaloneCall(grouping, part)) {
    placeStandalone(grouping, index)
    return
  }
  const member = sessionMemberCall(grouping, part)
  if (member) {
    placePageAct(grouping, member, index)
    return
  }
  const session = openSessionOf(grouping.segments)
  if (session && foldsIntoOpenSession(grouping, part)) {
    foldIntoSession(grouping, session, part, index)
    return
  }
  if (part.type === 'tool-result') {
    foldResultIntoTrailingChain(grouping, index)
    return
  }
  placeInChain(grouping, index)
}

function groupWithPageSessions(
  parts: ReadonlyArray<MessagePart>,
  pageActNames: ReadonlySet<string>,
  pageToolPrefix: string | undefined,
  standalone: ((name: string) => boolean) | undefined,
): Segment[] {
  const grouping: PageSessionGrouping = {
    segments: [],
    openCallIds: new Set(),
    pageActNames,
    pageToolPrefix,
    actParentIds: foldableParentIds(parts, pageActNames),
    standalone,
  }
  parts.forEach((part, index) => placeSegmentPart(grouping, part, index))
  return grouping.segments
}

const emptyPageActNames: ReadonlySet<string> = new Set()

export function groupSegments(parts: ReadonlyArray<MessagePart>, options?: GroupingOptions): Segment[] {
  return groupWithPageSessions(
    parts,
    options?.pageActNames ?? emptyPageActNames,
    options?.pageToolPrefix,
    options?.standalone,
  )
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
