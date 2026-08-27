import {range, uniqBy} from 'es-toolkit'
import type {MessagePart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {
  defaultGrouper,
  isReplyText,
  parentToolCallIdOf,
  PAGE_SESSION_GROUP_KEY,
  PAGE_SESSION_PATH,
  stickyGrouper,
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

function replyPrefixCounts(parts: ReadonlyArray<MessagePart>): number[] {
  return parts.reduce<number[]>(
    (counts, part) => {
      counts.push((counts.at(-1) ?? 0) + (isReplyText(part) ? 1 : 0))
      return counts
    },
    [0],
  )
}

function foldableParentIds(parts: ReadonlyArray<MessagePart>, actNames: ReadonlySet<string>): ReadonlySet<string> {
  const repliesBefore = replyPrefixCounts(parts)
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
    return (repliesBefore[childIndex] ?? 0) - (repliesBefore[parentIndex + 1] ?? 0) === 0
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

type SessionRunFold = {runs: SessionRun[]; open: boolean}

function sessionRuns(
  parts: ReadonlyArray<MessagePart>,
  paths: ReadonlyArray<GroupPath | null>,
  actNames: ReadonlySet<string>,
): readonly SessionRun[] {
  return paths.reduce<SessionRunFold>(
    (state, path, index) => {
      if (path === null || path === undefined) return state
      if (!isSessionPath(path)) return {runs: state.runs, open: false}
      const part = parts[index]
      const isAct = part?.type === 'tool-call' && actNames.has(part.name)
      const current = state.open ? state.runs.at(-1) : undefined
      if (!current) {
        state.runs.push({start: index, end: index, hasAct: isAct})
        return {runs: state.runs, open: true}
      }
      current.end = index
      current.hasAct = current.hasAct || isAct
      return {runs: state.runs, open: true}
    },
    {runs: [], open: false},
  ).runs
}

function dropActlessSessions(
  parts: ReadonlyArray<MessagePart>,
  paths: ReadonlyArray<GroupPath | null>,
  basePaths: ReadonlyArray<GroupPath | null>,
  actNames: ReadonlySet<string>,
): ReadonlyArray<GroupPath | null> {
  const actless = sessionRuns(parts, paths, actNames).filter((run) => !run.hasAct)
  if (actless.length === 0) return paths
  const demoted = new Set(actless.flatMap((run) => range(run.start, run.end + 1)))
  return paths.map((path, index) => (demoted.has(index) ? (basePaths[index] ?? null) : path))
}

export function createPageSessionGrouper(config: PageSessionGrouperConfig): Grouper {
  const classify: Grouper = (parts, context) => {
    const basePaths = defaultGrouper(parts, context)
    const actParentIds = foldableParentIds(parts, config.actNames)
    const state: SessionState = {openCallIds: new Set(), open: false}
    const paths = parts.map((part, index) => sessionPath(state, config, actParentIds, basePaths[index] ?? null, part))
    return dropActlessSessions(parts, paths, basePaths, config.actNames)
  }
  const sticky = stickyGrouper(classify)
  return (parts, context) => (context.live === true ? sticky(parts, context) : classify(parts, context))
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
