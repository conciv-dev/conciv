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

export type ChainSegment = {kind: 'chain'; indices: number[]}
export type ReplySegment = {kind: 'reply'; index: number}
export type PageSessionSegment = {kind: 'page-session'; indices: number[]}
export type Segment = ChainSegment | ReplySegment | PageSessionSegment

export type GroupingOptions = {pageActNames?: ReadonlySet<string>; pageToolPrefix?: string}

const isReplyText = (part: MessagePart): boolean => part.type === 'text' && part.content.trim().length > 0

type PageSessionGrouping = {
  segments: Segment[]
  openCallIds: Set<string>
  pageActNames: ReadonlySet<string>
  pageToolPrefix: string | undefined
  actParentIds: ReadonlySet<string>
}

function foldableParentIds(parts: ReadonlyArray<MessagePart>, pageActNames: ReadonlySet<string>): Set<string> {
  const parentIndexById = new Map<string, number>()
  const firstActChildIndex = new Map<string, number>()
  const replyIndices: number[] = []
  parts.forEach((part, index) => {
    if (isReplyText(part)) replyIndices.push(index)
    if (part.type !== 'tool-call') return
    if (part.id && !parentIndexById.has(part.id)) parentIndexById.set(part.id, index)
    if (!pageActNames.has(part.name)) return
    const parent = parentToolCallIdOf(part)
    if (parent !== null && !firstActChildIndex.has(parent)) firstActChildIndex.set(parent, index)
  })
  const ids = new Set<string>()
  for (const [parent, childIndex] of firstActChildIndex) {
    const parentIndex = parentIndexById.get(parent)
    if (parentIndex === undefined) continue
    const split = replyIndices.some((replyIndex) => replyIndex > parentIndex && replyIndex < childIndex)
    if (!split) ids.add(parent)
  }
  return ids
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
  placeInChain(grouping, index)
}

function groupWithPageSessions(
  parts: ReadonlyArray<MessagePart>,
  pageActNames: ReadonlySet<string>,
  pageToolPrefix: string | undefined,
): Segment[] {
  const grouping: PageSessionGrouping = {
    segments: [],
    openCallIds: new Set(),
    pageActNames,
    pageToolPrefix,
    actParentIds: foldableParentIds(parts, pageActNames),
  }
  parts.forEach((part, index) => placeSegmentPart(grouping, part, index))
  return grouping.segments
}

export function groupSegments(parts: ReadonlyArray<MessagePart>, options?: GroupingOptions): Segment[] {
  const pageActNames = options?.pageActNames
  if (pageActNames) return groupWithPageSessions(parts, pageActNames, options?.pageToolPrefix)
  return parts.reduce<Segment[]>((segments, part, index) => {
    if (isReplyText(part)) return [...segments, {kind: 'reply', index}]
    const last = segments.at(-1)
    return last?.kind === 'chain'
      ? [...segments.slice(0, -1), {kind: 'chain', indices: [...last.indices, index]}]
      : [...segments, {kind: 'chain', indices: [index]}]
  }, [])
}

export type ResultPairing = {byCallId: Map<string, ToolResultPart>; hiddenResultIds: Set<string>}

export function pairResults(parts: ReadonlyArray<MessagePart>): ResultPairing {
  const callIds = new Set<string>()
  for (const part of parts) if (part.type === 'tool-call' && part.id) callIds.add(part.id)
  const byCallId = new Map<string, ToolResultPart>()
  const hiddenResultIds = new Set<string>()
  for (const part of parts) {
    if (part.type !== 'tool-result' || !part.toolCallId) continue
    byCallId.set(part.toolCallId, part)
    if (callIds.has(part.toolCallId)) hiddenResultIds.add(part.toolCallId)
  }
  return {byCallId, hiddenResultIds}
}
