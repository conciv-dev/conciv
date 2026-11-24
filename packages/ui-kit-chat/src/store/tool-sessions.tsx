import {range, uniqBy} from 'es-toolkit'
import {createMemo, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ChatPart, ToolCallPart} from '@conciv/protocol/chat-message-types'
import type {ToolRender} from '../tools/primitives/tool-props.js'
import {
  isReplyText,
  readParentToolCallId,
  stickyGrouper,
  type GroupKey,
  type GroupPath,
  type GroupRenderProps,
  type Grouper,
} from './grouping.js'

const SESSION_KEY_PREFIX = 'group-tool-session-'

type ToolSession = {prefix: string; key: GroupKey; acts: (name: string) => boolean}

type SessionFor = (name: string) => ToolSession | undefined

type OpenSession = {session: ToolSession; callIds: Set<string>}

type SessionState = {open: OpenSession | undefined}

function underscorePrefixes(name: string): string[] {
  return [...name.matchAll(/_/g)].map((match) => name.slice(0, match.index + 1))
}

function toolSessionFor(render: ToolRender, name: string): ToolSession | undefined {
  return underscorePrefixes(name)
    .flatMap((prefix): ToolSession[] => {
      const acts = render(prefix)?.acts
      return acts === undefined ? [] : [{prefix, key: `${SESSION_KEY_PREFIX}${prefix}`, acts}]
    })
    .at(0)
}

function sessionPrefix(key: GroupKey): string | undefined {
  return key.startsWith(SESSION_KEY_PREFIX) ? key.slice(SESSION_KEY_PREFIX.length) : undefined
}

function replyPrefixCounts(parts: ReadonlyArray<ChatPart>): number[] {
  return parts.reduce<number[]>(
    (counts, part) => {
      counts.push((counts.at(-1) ?? 0) + (isReplyText(part) ? 1 : 0))
      return counts
    },
    [0],
  )
}

function foldableParents(parts: ReadonlyArray<ChatPart>, sessionFor: SessionFor): ReadonlyMap<string, ToolSession> {
  const repliesBefore = replyPrefixCounts(parts)
  const calls = parts.flatMap((part, index) => (part.type === 'tool-call' ? [{call: part, index}] : []))
  const firstIndexByCallId = new Map(
    uniqBy(
      calls.filter(({call}) => call.id.length > 0),
      ({call}) => call.id,
    ).map(({call, index}) => [call.id, index]),
  )
  const actChildren = calls.flatMap(({call, index}) => {
    const parent = readParentToolCallId(call)
    const session = sessionFor(call.name)
    return session?.acts(call.name) === true && parent !== null ? [{parent, index, session}] : []
  })
  const unsplit = uniqBy(actChildren, ({parent}) => parent).filter(({parent, index: childIndex}) => {
    const parentIndex = firstIndexByCallId.get(parent)
    if (parentIndex === undefined) return false
    return (repliesBefore[childIndex] ?? 0) - (repliesBefore[parentIndex + 1] ?? 0) === 0
  })
  return new Map(unsplit.map(({parent, session}) => [parent, session]))
}

function sessionMember(
  sessionFor: SessionFor,
  actParents: ReadonlyMap<string, ToolSession>,
  part: ChatPart,
): {call: ToolCallPart; session: ToolSession} | undefined {
  if (part.type !== 'tool-call' || part.state === 'approval-requested') return undefined
  const own = sessionFor(part.name)
  const session = own?.acts(part.name) === true ? own : actParents.get(part.id)
  return session === undefined ? undefined : {call: part, session}
}

function toolCallFolds(open: OpenSession, part: ToolCallPart): boolean {
  if (part.state === 'approval-requested') return false
  const parent = readParentToolCallId(part)
  if (parent !== null && open.callIds.has(parent)) return true
  return part.name.startsWith(open.session.prefix)
}

function foldsIntoOpenSession(open: OpenSession, part: ChatPart): boolean {
  if (part.type === 'text' || part.type === 'thinking') return true
  if (part.type === 'tool-call') return toolCallFolds(open, part)
  if (part.type === 'tool-result') return open.callIds.has(part.toolCallId)
  return false
}

function claimSession(
  state: SessionState,
  sessionFor: SessionFor,
  actParents: ReadonlyMap<string, ToolSession>,
  part: ChatPart,
): ToolSession | undefined {
  const member = sessionMember(sessionFor, actParents, part)
  if (member) {
    const open =
      state.open?.session.key === member.session.key
        ? state.open
        : {session: member.session, callIds: new Set<string>()}
    if (member.call.id.length > 0) open.callIds.add(member.call.id)
    state.open = open
    return member.session
  }
  const open = state.open
  if (!open || !foldsIntoOpenSession(open, part)) return undefined
  if (part.type === 'tool-call' && part.id.length > 0) open.callIds.add(part.id)
  return open.session
}

function sessionPath(
  state: SessionState,
  sessionFor: SessionFor,
  actParents: ReadonlyMap<string, ToolSession>,
  basePath: GroupPath | null,
  part: ChatPart,
): GroupPath | null {
  if (basePath?.length === 0) {
    state.open = undefined
    return basePath
  }
  const session = claimSession(state, sessionFor, actParents, part)
  if (session) return basePath === null ? null : [session.key]
  if (basePath === null) return null
  state.open = undefined
  return basePath
}

type SessionRun = {key: GroupKey; start: number; end: number; hasAct: boolean}

type SessionRunFold = {runs: SessionRun[]; open: boolean}

function partActs(sessionFor: SessionFor, key: GroupKey, part: ChatPart | undefined): boolean {
  if (part?.type !== 'tool-call') return false
  const own = sessionFor(part.name)
  return own?.key === key && own.acts(part.name)
}

function sessionRuns(
  parts: ReadonlyArray<ChatPart>,
  paths: ReadonlyArray<GroupPath | null>,
  sessionFor: SessionFor,
): readonly SessionRun[] {
  return paths.reduce<SessionRunFold>(
    (state, path, index) => {
      if (path === null || path === undefined) return state
      const key = path[0]
      if (key === undefined || sessionPrefix(key) === undefined) return {runs: state.runs, open: false}
      const isAct = partActs(sessionFor, key, parts[index])
      const current = state.open ? state.runs.at(-1) : undefined
      if (!current || current.key !== key) {
        state.runs.push({key, start: index, end: index, hasAct: isAct})
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
  parts: ReadonlyArray<ChatPart>,
  paths: ReadonlyArray<GroupPath | null>,
  basePaths: ReadonlyArray<GroupPath | null>,
  sessionFor: SessionFor,
): ReadonlyArray<GroupPath | null> {
  const actless = sessionRuns(parts, paths, sessionFor).filter((run) => !run.hasAct)
  if (actless.length === 0) return paths
  const demoted = new Set(actless.flatMap((run) => range(run.start, run.end + 1)))
  return paths.map((path, index) => (demoted.has(index) ? (basePaths[index] ?? null) : path))
}

export function createToolSessionGrouper(base: Grouper, render: ToolRender): Grouper {
  const sessionFor: SessionFor = (name) => toolSessionFor(render, name)
  const classify: Grouper = (parts, context) => {
    const basePaths = base(parts, context)
    const actParents = foldableParents(parts, sessionFor)
    const state: SessionState = {open: undefined}
    const paths = parts.map((part, index) => sessionPath(state, sessionFor, actParents, basePaths[index] ?? null, part))
    return dropActlessSessions(parts, paths, basePaths, sessionFor)
  }
  const sticky = stickyGrouper(classify)
  return (parts, context) => (context.live === true ? sticky(parts, context) : classify(parts, context))
}

function sessionMetadata(
  all: readonly ChatPart[],
  indices: readonly number[],
  resultFor: GroupRenderProps['resultFor'],
  folded: boolean,
): Record<string, unknown> {
  const parts = indices.flatMap((index) => {
    const part = all[index]
    return part === undefined ? [] : [part]
  })
  const results = parts.flatMap((part) => {
    const result = part.type === 'tool-call' ? resultFor(part.id) : undefined
    return result === undefined ? [] : [result]
  })
  return {parts, results, folded}
}

export function ToolSessionGroup(props: GroupRenderProps & {render: ToolRender | undefined}): JSX.Element {
  const prefix = () => sessionPrefix(props.node.key)
  const card = () => {
    const name = prefix()
    return name === undefined ? undefined : props.render?.(name)?.render
  }
  const metadata = createMemo(() =>
    sessionMetadata(props.parts(), props.node.indices, props.resultFor, props.folded ?? false),
  )
  return (
    <Show when={card()} fallback={props.children}>
      {(Card) => (
        <Dynamic
          component={Card()}
          tool={prefix() ?? ''}
          input={{}}
          metadata={metadata()}
          status={props.streaming ? 'running' : 'complete'}
          sessionID={props.sessionID}
        />
      )}
    </Show>
  )
}
