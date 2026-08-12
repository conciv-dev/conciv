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
  standaloneCallIds: Set<string>
  pageActNames: ReadonlySet<string>
  pageToolPrefix: string | undefined
  actParentIds: ReadonlySet<string>
  standalone: ((name: string) => boolean) | undefined
}

function foldableParentIds(parts: ReadonlyArray<MessagePart>, pageActNames: ReadonlySet<string>): Set<string> {
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

function asStandaloneCall(grouping: PageSessionGrouping, part: MessagePart): ToolCallPart | null {
  return part.type === 'tool-call' && (grouping.standalone?.(part.name) ?? false) ? part : null
}

function placeStandalone(grouping: PageSessionGrouping, part: ToolCallPart, index: number): void {
  grouping.openCallIds.clear()
  if (part.id) grouping.standaloneCallIds.add(part.id)
  grouping.segments.push({kind: 'standalone', index})
}

function isStandaloneResult(grouping: PageSessionGrouping, part: MessagePart): boolean {
  return part.type === 'tool-result' && grouping.standaloneCallIds.has(part.toolCallId)
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
  const standaloneCall = asStandaloneCall(grouping, part)
  if (standaloneCall) {
    placeStandalone(grouping, standaloneCall, index)
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
  if (isStandaloneResult(grouping, part)) return
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
    standaloneCallIds: new Set(),
    pageActNames,
    pageToolPrefix,
    actParentIds: foldableParentIds(parts, pageActNames),
    standalone,
  }
  parts.forEach((part, index) => placeSegmentPart(grouping, part, index))
  return grouping.segments
}

type PlainGrouping = {
  segments: Segment[]
  standaloneCallIds: Set<string>
  standalone: ((name: string) => boolean) | undefined
}

function asPlainStandaloneCall(grouping: PlainGrouping, part: MessagePart): ToolCallPart | null {
  return part.type === 'tool-call' && (grouping.standalone?.(part.name) ?? false) ? part : null
}

function placePlainStandalone(grouping: PlainGrouping, part: ToolCallPart, index: number): void {
  if (part.id) grouping.standaloneCallIds.add(part.id)
  grouping.segments.push({kind: 'standalone', index})
}

function isPlainStandaloneResult(grouping: PlainGrouping, part: MessagePart): boolean {
  return part.type === 'tool-result' && grouping.standaloneCallIds.has(part.toolCallId)
}

function placePlainChain(grouping: PlainGrouping, index: number): void {
  const last = grouping.segments.at(-1)
  if (last?.kind === 'chain') {
    last.indices.push(index)
    return
  }
  grouping.segments.push({kind: 'chain', indices: [index]})
}

function placePlainPart(grouping: PlainGrouping, part: MessagePart, index: number): void {
  if (isReplyText(part)) {
    grouping.segments.push({kind: 'reply', index})
    return
  }
  const standaloneCall = asPlainStandaloneCall(grouping, part)
  if (standaloneCall) {
    placePlainStandalone(grouping, standaloneCall, index)
    return
  }
  if (isPlainStandaloneResult(grouping, part)) return
  placePlainChain(grouping, index)
}

function groupPlain(parts: ReadonlyArray<MessagePart>, standalone: ((name: string) => boolean) | undefined): Segment[] {
  const grouping: PlainGrouping = {segments: [], standaloneCallIds: new Set(), standalone}
  parts.forEach((part, index) => placePlainPart(grouping, part, index))
  return grouping.segments
}

export function groupSegments(parts: ReadonlyArray<MessagePart>, options?: GroupingOptions): Segment[] {
  const pageActNames = options?.pageActNames
  const standalone = options?.standalone
  if (pageActNames) return groupWithPageSessions(parts, pageActNames, options?.pageToolPrefix, standalone)
  return groupPlain(parts, standalone)
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
