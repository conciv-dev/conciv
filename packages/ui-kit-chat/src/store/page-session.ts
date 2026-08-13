import {uniqBy} from 'es-toolkit'
import type {MessagePart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {
  defaultGrouper,
  isReplyText,
  parentToolCallIdOf,
  PAGE_SESSION_GROUP_KEY,
  PAGE_SESSION_PATH,
  type GroupEntry,
  type GroupPath,
  type Grouper,
  type Grouping,
} from './grouping.js'

export type PageSessionThinkingPart = Extract<MessagePart, {type: 'thinking'}>

export type PageSessionConfig = {
  entry: GroupEntry
  actNames: ReadonlySet<string>
  toolPrefix: string
}

export type PageSessionGrouperConfig = {actNames: ReadonlySet<string>; toolPrefix: string}

type SessionState = {openCallIds: Set<string>; open: boolean}

function foldableParentIds(parts: ReadonlyArray<MessagePart>, actNames: ReadonlySet<string>): ReadonlySet<string> {
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
    return actNames.has(call.name) && parent !== null ? [{parent, index}] : []
  })
  const unsplit = uniqBy(actChildren, ({parent}) => parent).filter(({parent, index: childIndex}) => {
    const parentIndex = firstIndexByCallId.get(parent)
    if (parentIndex === undefined) return false
    return !replyIndices.some((replyIndex) => replyIndex > parentIndex && replyIndex < childIndex)
  })
  return new Set(unsplit.map(({parent}) => parent))
}

function sessionMemberCall(
  config: PageSessionGrouperConfig,
  actParentIds: ReadonlySet<string>,
  part: MessagePart,
): ToolCallPart | undefined {
  if (part.type !== 'tool-call' || part.state === 'approval-requested') return undefined
  return config.actNames.has(part.name) || actParentIds.has(part.id) ? part : undefined
}

function toolCallFolds(state: SessionState, config: PageSessionGrouperConfig, part: ToolCallPart): boolean {
  if (part.state === 'approval-requested') return false
  const parent = parentToolCallIdOf(part)
  if (parent !== null && state.openCallIds.has(parent)) return true
  return part.name.startsWith(config.toolPrefix)
}

function foldsIntoOpenSession(state: SessionState, config: PageSessionGrouperConfig, part: MessagePart): boolean {
  if (part.type === 'text' || part.type === 'thinking') return true
  if (part.type === 'tool-call') return toolCallFolds(state, config, part)
  if (part.type === 'tool-result') return state.openCallIds.has(part.toolCallId)
  return false
}

function closeSession(state: SessionState): void {
  state.openCallIds.clear()
  state.open = false
}

function claimSessionPath(
  state: SessionState,
  config: PageSessionGrouperConfig,
  actParentIds: ReadonlySet<string>,
  part: MessagePart,
): boolean {
  const member = sessionMemberCall(config, actParentIds, part)
  if (member) {
    if (member.id.length > 0) state.openCallIds.add(member.id)
    state.open = true
    return true
  }
  if (!state.open || !foldsIntoOpenSession(state, config, part)) return false
  if (part.type === 'tool-call' && part.id.length > 0) state.openCallIds.add(part.id)
  return true
}

function sessionPath(
  state: SessionState,
  config: PageSessionGrouperConfig,
  actParentIds: ReadonlySet<string>,
  basePath: GroupPath | null,
  part: MessagePart,
): GroupPath | null {
  if (basePath?.length === 0) {
    closeSession(state)
    return basePath
  }
  if (claimSessionPath(state, config, actParentIds, part)) return basePath === null ? null : PAGE_SESSION_PATH
  if (basePath === null) return null
  closeSession(state)
  return basePath
}

function isSessionPath(path: GroupPath | null | undefined): boolean {
  return path?.[0] === PAGE_SESSION_GROUP_KEY
}

type SessionRun = {start: number; end: number; hasAct: boolean}

function sessionRuns(
  parts: ReadonlyArray<MessagePart>,
  paths: ReadonlyArray<GroupPath | null>,
  actNames: ReadonlySet<string>,
): SessionRun[] {
  const runs: SessionRun[] = []
  let open = false
  paths.forEach((path, index) => {
    if (path === null || path === undefined) return
    if (!isSessionPath(path)) {
      open = false
      return
    }
    const part = parts[index]
    const isAct = part?.type === 'tool-call' && actNames.has(part.name)
    const current = open ? runs.at(-1) : undefined
    if (current) {
      current.end = index
      current.hasAct = current.hasAct || isAct
      return
    }
    runs.push({start: index, end: index, hasAct: isAct})
    open = true
  })
  return runs
}

function dropActlessSessions(
  parts: ReadonlyArray<MessagePart>,
  paths: ReadonlyArray<GroupPath | null>,
  basePaths: ReadonlyArray<GroupPath | null>,
  actNames: ReadonlySet<string>,
): ReadonlyArray<GroupPath | null> {
  const actless = sessionRuns(parts, paths, actNames).filter((run) => !run.hasAct)
  if (actless.length === 0) return paths
  return paths.map((path, index) =>
    actless.some((run) => run.start <= index && index <= run.end) ? (basePaths[index] ?? null) : path,
  )
}

export function createPageSessionGrouper(config: PageSessionGrouperConfig): Grouper {
  return (parts, context) => {
    const basePaths = defaultGrouper(parts, context)
    const actParentIds = foldableParentIds(parts, config.actNames)
    const state: SessionState = {openCallIds: new Set(), open: false}
    const paths = parts.map((part, index) => sessionPath(state, config, actParentIds, basePaths[index] ?? null, part))
    return dropActlessSessions(parts, paths, basePaths, config.actNames)
  }
}

export function createGrouping(
  config: PageSessionConfig | undefined,
  toolEntries: ReadonlyArray<ToolCardEntry>,
): Grouping {
  const grouper = config
    ? createPageSessionGrouper({actNames: config.actNames, toolPrefix: config.toolPrefix})
    : defaultGrouper
  return {grouper, context: {toolEntries}}
}

export function pageSessionCallParts(
  parts: ReadonlyArray<MessagePart>,
  indices: ReadonlyArray<number>,
): ToolCallPart[] {
  return indices.flatMap((index) => {
    const part = parts[index]
    return part?.type === 'tool-call' ? [part] : []
  })
}

export function pageSessionThinkingParts(
  parts: ReadonlyArray<MessagePart>,
  indices: ReadonlyArray<number>,
): PageSessionThinkingPart[] {
  return indices.flatMap((index) => {
    const part = parts[index]
    return part?.type === 'thinking' && part.content.trim().length > 0 ? [part] : []
  })
}
