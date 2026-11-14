import type {SessionId} from '@conciv/protocol/chat-types'
import {Tool, type Rule} from '@conciv/plugin'
import type {Action, Command, Control, Method, Outcome, Result, State, Tab} from './rpc.js'
import {id as skillId} from './skill.js'

export const PERMISSION_SYNC_TIMEOUT_MS = 10_000

export const ACCESS = [
  {action: 'page', resource: '*'},
  {action: 'skill', resource: skillId},
] as const

export type PermissionSync = {readonly attempt: number; readonly allow: boolean}

export type Attachment = {
  readonly attempt: number
  readonly tab: Tab | undefined
  readonly pending: ReadonlyMap<string, Command>
}

export type SessionState =
  | {
      readonly status: 'attaching'
      readonly connections: ReadonlyMap<string, number>
      readonly sync: PermissionSync
    }
  | {
      readonly status: 'attached'
      readonly attachments: ReadonlyMap<string, Attachment>
      readonly focusedConnectionId: string | undefined
    }
  | {readonly status: 'revoking'; readonly sync: PermissionSync; readonly deleted: boolean}

export type RevokingSession = Extract<SessionState, {readonly status: 'revoking'}>

type AttachingSession = Extract<SessionState, {readonly status: 'attaching'}>

type AttachedSession = Extract<SessionState, {readonly status: 'attached'}>

export type ConnectionState =
  | {
      readonly status: 'active'
      readonly nextAttempt: number
      readonly sessions: ReadonlyMap<SessionId, SessionState>
    }
  | {
      readonly status: 'disposed'
      readonly nextAttempt: number
      readonly sessions: ReadonlyMap<SessionId, RevokingSession>
    }

export type AttachmentOutcome = 'closed' | 'replaced' | 'unavailable'

export type RequestSettlement =
  | {readonly ok: true; readonly result: Result}
  | {readonly ok: false; readonly error: Tool.Error; readonly tabClosed?: true}

export type ConnectionEvent =
  | {
      readonly type: 'attach.started'
      readonly sessionId: SessionId
      readonly attempt: number
      readonly connectionId: string
    }
  | {readonly type: 'attach.closed'; readonly sessionId: SessionId; readonly attempt: number}
  | {readonly type: 'permissions.synced'; readonly sessionId: SessionId; readonly attempt: number}
  | {
      readonly type: 'permissions.failed'
      readonly sessionId: SessionId
      readonly attempt: number
      readonly error: unknown
    }
  | {readonly type: 'permissions.timed-out'; readonly sessionId: SessionId; readonly attempt: number}
  | {
      readonly type: 'state.updated'
      readonly sessionId: SessionId
      readonly connectionId: string
      readonly tab: Tab
    }
  | {
      readonly type: 'request.started'
      readonly sessionId: SessionId
      readonly connectionId: string
      readonly requestId: string
      readonly command: Command
    }
  | {
      readonly type: 'request.dispatch-failed'
      readonly sessionId: SessionId
      readonly connectionId: string
      readonly requestId: string
      readonly error: unknown
    }
  | {
      readonly type: 'request.settled'
      readonly sessionId: SessionId
      readonly connectionId: string
      readonly requestId: string
      readonly outcome: Outcome
    }
  | {
      readonly type: 'request.timed-out'
      readonly sessionId: SessionId
      readonly connectionId: string
      readonly requestId: string
    }
  | {
      readonly type: 'request.cancelled'
      readonly sessionId: SessionId
      readonly connectionId: string
      readonly requestId: string
    }
  | {readonly type: 'session.deleted'; readonly sessionId: SessionId}
  | {readonly type: 'disposed'}

export type ConnectionEffect =
  | {
      readonly type: 'sync-permissions'
      readonly sessionId: SessionId
      readonly attempt: number
      readonly allow: boolean
    }
  | {readonly type: 'close-attachment'; readonly attempt: number; readonly outcome: AttachmentOutcome}
  | {readonly type: 'emit-control'; readonly control: Control}
  | {
      readonly type: 'dispatch-command'
      readonly sessionId: SessionId
      readonly connectionId: string
      readonly requestId: string
    }
  | {readonly type: 'settle-request'; readonly requestId: string; readonly settlement: RequestSettlement}
  | {readonly type: 'warn'; readonly message: string; readonly error: unknown}
  | {readonly type: 'notify-drained'}

export type ConnectionTransition = {readonly state: ConnectionState; readonly effects: readonly ConnectionEffect[]}

type SessionEvent = Exclude<ConnectionEvent, {readonly type: 'disposed'}>

type Step<S extends SessionState> = {
  readonly entry: S | undefined
  readonly nextAttempt: number
  readonly effects: readonly ConnectionEffect[]
}

export function createConnectionState(): ConnectionState {
  return {status: 'active', nextAttempt: 1, sessions: new Map()}
}

export function transitionConnection(state: ConnectionState, event: ConnectionEvent): ConnectionTransition {
  if (event.type === 'disposed') return dispose(state)

  if (event.type === 'request.started' && !isAttachedConnection(state, event.sessionId, event.connectionId))
    return {
      state,
      effects: [
        {
          type: 'settle-request',
          requestId: event.requestId,
          settlement: {ok: false, error: disconnectedBeforeDispatch()},
        },
      ],
    }

  const entry = state.sessions.get(event.sessionId)

  if (state.status === 'disposed') {
    if (!entry || entry.status !== 'revoking') return {state, effects: []}
    const step = transitionRevoking(entry, event, state.nextAttempt)

    if (!step) return {state, effects: []}
    const sessions = new Map(state.sessions)

    if (step.entry) sessions.set(event.sessionId, step.entry)

    if (!step.entry) sessions.delete(event.sessionId)

    return {
      state: {status: 'disposed', nextAttempt: step.nextAttempt, sessions},
      effects: sessions.size ? step.effects : [...step.effects, {type: 'notify-drained'}],
    }
  }

  const step = transitionSession(entry, event, state.nextAttempt)

  if (!step) return {state, effects: []}
  const sessions = new Map(state.sessions)

  if (step.entry) sessions.set(event.sessionId, step.entry)

  if (!step.entry) sessions.delete(event.sessionId)

  return {state: {status: 'active', nextAttempt: step.nextAttempt, sessions}, effects: step.effects}
}

function transitionSession(
  entry: SessionState | undefined,
  event: SessionEvent,
  nextAttempt: number,
): Step<SessionState> | undefined {
  if (event.type === 'attach.started') return attach(entry, event, nextAttempt)

  if (!entry) return undefined

  if (entry.status === 'revoking') return transitionRevoking(entry, event, nextAttempt)

  if (entry.status === 'attaching') return transitionAttaching(entry, event, nextAttempt)

  return transitionAttached(entry, event, nextAttempt)
}

function attach(
  entry: SessionState | undefined,
  event: Extract<SessionEvent, {readonly type: 'attach.started'}>,
  nextAttempt: number,
): Step<SessionState> | undefined {
  if (event.attempt !== nextAttempt) return undefined
  const only = new Map([[event.connectionId, event.attempt]])

  if (entry?.status === 'attaching') {
    const replaced = entry.connections.get(event.connectionId)
    return {
      entry: {...entry, connections: new Map(entry.connections).set(event.connectionId, event.attempt)},
      nextAttempt: nextAttempt + 1,
      effects: replaced === undefined ? [] : [{type: 'close-attachment', attempt: replaced, outcome: 'replaced'}],
    }
  }

  if (entry?.status === 'revoking')
    return {
      entry: {status: 'attaching', connections: only, sync: entry.sync},
      nextAttempt: nextAttempt + 1,
      effects: [],
    }

  if (entry?.status === 'attached') return join(entry, event, nextAttempt)
  const sync = {attempt: nextAttempt + 1, allow: true}

  return {
    entry: {status: 'attaching', connections: only, sync},
    nextAttempt: nextAttempt + 2,
    effects: [{type: 'sync-permissions', sessionId: event.sessionId, ...sync}],
  }
}

function join(
  entry: AttachedSession,
  event: Extract<SessionEvent, {readonly type: 'attach.started'}>,
  nextAttempt: number,
): Step<SessionState> {
  const replaced = entry.attachments.get(event.connectionId)
  const attachments = new Map(entry.attachments)
  attachments.delete(event.connectionId)
  attachments.set(event.connectionId, {attempt: event.attempt, tab: undefined, pending: new Map()})
  const closing: ConnectionEffect[] = replaced
    ? [...failPending(replaced), {type: 'close-attachment', attempt: replaced.attempt, outcome: 'replaced'}]
    : []

  return {
    entry: {...entry, attachments},
    nextAttempt: nextAttempt + 1,
    effects: [...closing, attachedControl(event.connectionId)],
  }
}

function transitionAttaching(
  entry: AttachingSession,
  event: SessionEvent,
  nextAttempt: number,
): Step<SessionState> | undefined {
  if (
    event.type === 'permissions.synced' ||
    event.type === 'permissions.failed' ||
    event.type === 'permissions.timed-out'
  ) {
    if (event.attempt !== entry.sync.attempt) return undefined
    const warning = syncWarning(event, entry.sync)

    if (!entry.sync.allow) {
      const sync = {attempt: nextAttempt, allow: true}

      return {
        entry: {...entry, sync},
        nextAttempt: nextAttempt + 1,
        effects: [...warning, {type: 'sync-permissions', sessionId: event.sessionId, ...sync}],
      }
    }

    if (event.type === 'permissions.synced')
      return {
        entry: {
          status: 'attached',
          attachments: new Map(
            Array.from(entry.connections, ([connectionId, attempt]) => [
              connectionId,
              {attempt, tab: undefined, pending: new Map()},
            ]),
          ),
          focusedConnectionId: undefined,
        },
        nextAttempt,
        effects: Array.from(entry.connections.keys(), attachedControl),
      }
    const sync = {attempt: nextAttempt, allow: false}

    return {
      entry: {status: 'revoking', sync, deleted: false},
      nextAttempt: nextAttempt + 1,
      effects: [
        ...warning,
        ...closeEvery(entry.connections.values(), 'unavailable'),
        {type: 'sync-permissions', sessionId: event.sessionId, ...sync},
      ],
    }
  }

  if (event.type === 'attach.closed') {
    const closed = Array.from(entry.connections).find(([, attempt]) => attempt === event.attempt)

    if (!closed) return undefined
    const connections = new Map(entry.connections)
    connections.delete(closed[0])

    return {
      entry: connections.size ? {...entry, connections} : {status: 'revoking', sync: entry.sync, deleted: false},
      nextAttempt,
      effects: [{type: 'close-attachment', attempt: event.attempt, outcome: 'closed'}],
    }
  }

  if (event.type === 'session.deleted')
    return {
      entry: {status: 'revoking', sync: entry.sync, deleted: true},
      nextAttempt,
      effects: closeEvery(entry.connections.values(), 'closed'),
    }

  return undefined
}

function transitionAttached(
  entry: AttachedSession,
  event: SessionEvent,
  nextAttempt: number,
): Step<SessionState> | undefined {
  if (event.type === 'state.updated') return updateTabState(entry, event, nextAttempt)

  if (event.type === 'request.started') {
    const attachment = entry.attachments.get(event.connectionId)

    if (!attachment || attachment.pending.has(event.requestId)) return undefined

    return {
      entry: withAttachment(entry, event.connectionId, {
        ...attachment,
        pending: new Map(attachment.pending).set(event.requestId, event.command),
      }),
      nextAttempt,
      effects: [
        {
          type: 'dispatch-command',
          sessionId: event.sessionId,
          connectionId: event.connectionId,
          requestId: event.requestId,
        },
      ],
    }
  }

  if (
    event.type === 'request.dispatch-failed' ||
    event.type === 'request.settled' ||
    event.type === 'request.timed-out' ||
    event.type === 'request.cancelled'
  ) {
    const attachment = entry.attachments.get(event.connectionId)
    const command = attachment?.pending.get(event.requestId)

    if (!attachment || !command) return undefined
    const pending = new Map(attachment.pending)
    pending.delete(event.requestId)

    return {
      entry: withAttachment(entry, event.connectionId, {...attachment, pending}),
      nextAttempt,
      effects: settleRequest(event, command),
    }
  }

  if (event.type === 'session.deleted')
    return {
      entry: undefined,
      nextAttempt,
      effects: [
        ...Array.from(entry.attachments.values()).flatMap(failPending),
        ...closeEvery(readAttempts(entry), 'closed'),
      ],
    }

  if (event.type === 'attach.closed') return closeTab(entry, event, nextAttempt)

  return undefined
}

function closeTab(
  entry: AttachedSession,
  event: Extract<SessionEvent, {readonly type: 'attach.closed'}>,
  nextAttempt: number,
): Step<SessionState> | undefined {
  const closed = Array.from(entry.attachments).find(([, attachment]) => attachment.attempt === event.attempt)

  if (!closed) return undefined

  if (entry.attachments.size === 1) return revokeAttached(entry, event.sessionId, nextAttempt)
  const [connectionId, attachment] = closed
  const attachments = new Map(entry.attachments)
  attachments.delete(connectionId)

  return {
    entry: {
      status: 'attached',
      attachments,
      focusedConnectionId: entry.focusedConnectionId === connectionId ? undefined : entry.focusedConnectionId,
    },
    nextAttempt,
    effects: [...failPending(attachment), {type: 'close-attachment', attempt: attachment.attempt, outcome: 'closed'}],
  }
}

function transitionRevoking(
  entry: RevokingSession,
  event: SessionEvent,
  nextAttempt: number,
): Step<RevokingSession> | undefined {
  if (event.type === 'session.deleted')
    return entry.deleted ? undefined : {entry: {...entry, deleted: true}, nextAttempt, effects: []}

  if (
    event.type !== 'permissions.synced' &&
    event.type !== 'permissions.failed' &&
    event.type !== 'permissions.timed-out'
  )
    return undefined

  if (event.attempt !== entry.sync.attempt) return undefined
  const warning = syncWarning(event, entry.sync)

  if (entry.sync.allow && !entry.deleted) {
    const sync = {attempt: nextAttempt, allow: false}

    return {
      entry: {status: 'revoking', sync, deleted: false},
      nextAttempt: nextAttempt + 1,
      effects: [...warning, {type: 'sync-permissions', sessionId: event.sessionId, ...sync}],
    }
  }

  return {entry: undefined, nextAttempt, effects: warning}
}

function dispose(state: ConnectionState): ConnectionTransition {
  if (state.status === 'disposed') return {state, effects: []}
  const effects: ConnectionEffect[] = []
  const sessions = new Map<SessionId, RevokingSession>()
  const nextAttempt = Array.from(state.sessions).reduce((attempt, [sessionId, entry]) => {
    if (entry.status === 'revoking') {
      sessions.set(sessionId, entry)

      return attempt
    }

    if (entry.status === 'attaching') {
      sessions.set(sessionId, {status: 'revoking', sync: entry.sync, deleted: false})
      effects.push(...closeEvery(entry.connections.values(), 'closed'))

      return attempt
    }
    const step = revokeAttached(entry, sessionId, attempt)

    if (step.entry) sessions.set(sessionId, step.entry)
    effects.push(...step.effects)

    return step.nextAttempt
  }, state.nextAttempt)

  if (!sessions.size) effects.push({type: 'notify-drained'})

  return {state: {status: 'disposed', nextAttempt, sessions}, effects}
}

function revokeAttached(entry: AttachedSession, sessionId: SessionId, nextAttempt: number): Step<RevokingSession> {
  const sync = {attempt: nextAttempt, allow: false}

  return {
    entry: {status: 'revoking', sync, deleted: false},
    nextAttempt: nextAttempt + 1,
    effects: [
      ...Array.from(entry.attachments.values()).flatMap(failPending),
      ...closeEvery(readAttempts(entry), 'closed'),
      {type: 'sync-permissions', sessionId, ...sync},
    ],
  }
}

function updateTabState(
  entry: AttachedSession,
  event: Extract<SessionEvent, {readonly type: 'state.updated'}>,
  nextAttempt: number,
): Step<SessionState> | undefined {
  const attachment = entry.attachments.get(event.connectionId)

  if (!attachment || attachment.tab === event.tab) return undefined

  return {
    entry: {
      ...withAttachment(entry, event.connectionId, {...attachment, tab: event.tab}),
      focusedConnectionId: event.tab.focused ? event.connectionId : entry.focusedConnectionId,
    },
    nextAttempt,
    effects: [],
  }
}

function withAttachment(entry: AttachedSession, connectionId: string, attachment: Attachment): AttachedSession {
  return {...entry, attachments: new Map(entry.attachments).set(connectionId, attachment)}
}

function readAttempts(entry: AttachedSession) {
  return Array.from(entry.attachments.values(), (attachment) => attachment.attempt)
}

function closeEvery(attempts: Iterable<number>, outcome: AttachmentOutcome): ConnectionEffect[] {
  return Array.from(attempts, (attempt) => ({type: 'close-attachment', attempt, outcome}))
}

function attachedControl(connectionId: string): ConnectionEffect {
  return {type: 'emit-control', control: {type: 'attached', connectionId, version: 1}}
}

function settleRequest(
  event: Extract<
    SessionEvent,
    {readonly type: 'request.dispatch-failed' | 'request.settled' | 'request.timed-out' | 'request.cancelled'}
  >,
  command: Command,
): ConnectionEffect[] {
  const cancel: ConnectionEffect = {
    type: 'emit-control',
    control: {type: 'cancel', connectionId: event.connectionId, requestId: event.requestId},
  }

  if (event.type === 'request.cancelled') return [cancel]
  const settle = (settlement: RequestSettlement): ConnectionEffect => ({
    type: 'settle-request',
    requestId: event.requestId,
    settlement,
  })

  if (event.type === 'request.timed-out')
    return [settle({ok: false, error: timedOut(command.action.type, command.timeoutMs)}), cancel]

  if (event.type === 'request.dispatch-failed')
    return [settle({ok: false, error: dispatchFailed(command.action.type, event.error)})]

  if (event.outcome.type === 'success') return [settle({ok: true, result: event.outcome.result})]
  const failed = event.outcome

  return [
    settle({
      ok: false,
      error: Tool.toolError({
        message: `[page.${failed.code}] ${failed.message}`,
        ...(failed.raised ? {error: failed.raised} : {}),
      }),
    }),
  ]
}

function failPending(attachment: Attachment): ConnectionEffect[] {
  return Array.from(attachment.pending.keys(), (requestId) => ({
    type: 'settle-request',
    requestId,
    settlement: {ok: false, error: disconnectedAfterDispatch(), tabClosed: true},
  }))
}

function syncWarning(
  event: Extract<SessionEvent, {readonly type: 'permissions.synced' | 'permissions.failed' | 'permissions.timed-out'}>,
  sync: PermissionSync,
): ConnectionEffect[] {
  const action = sync.allow ? 'grant' : 'revoke'

  if (event.type === 'permissions.failed')
    return [{type: 'warn', message: `Page permission ${action} failed`, error: event.error}]

  if (event.type === 'permissions.timed-out')
    return [
      {
        type: 'warn',
        message: `Page permission ${action} timed out after ${PERMISSION_SYNC_TIMEOUT_MS} ms`,
        error: undefined,
      },
    ]

  return []
}

export function reconcilePagePermissions(current: readonly Rule[] | undefined, allow: boolean): Rule[] | undefined {
  const rules = current ?? []
  const kept = rules.filter(
    (rule) =>
      rule.effect !== 'allow' ||
      !ACCESS.some((access) => access.action === rule.action && access.resource === rule.resource),
  )
  const next = allow ? [...kept, ...ACCESS.map((rule) => ({...rule, effect: 'allow' as const}))] : kept
  const unchanged =
    next.length === rules.length &&
    next.every(
      (rule, index) =>
        rule.action === rules[index]?.action &&
        rule.resource === rules[index]?.resource &&
        rule.effect === rules[index]?.effect,
    )

  return unchanged ? undefined : next
}

export function isConnectionDisposed(state: ConnectionState) {
  return state.status === 'disposed'
}

export function selectNextAttempt(state: ConnectionState) {
  return state.nextAttempt
}

function attachedEntry(state: ConnectionState, sessionId: SessionId) {
  if (state.status === 'disposed') return undefined
  const entry = state.sessions.get(sessionId)

  return entry?.status === 'attached' ? entry : undefined
}

export function isAttachedConnection(state: ConnectionState, sessionId: SessionId, connectionId: string) {
  return attachedEntry(state, sessionId)?.attachments.has(connectionId) === true
}

export function selectPendingCommand(
  state: ConnectionState,
  sessionId: SessionId,
  connectionId: string,
  requestId: string,
) {
  return attachedEntry(state, sessionId)?.attachments.get(connectionId)?.pending.get(requestId)
}

export function selectTabs(state: ConnectionState, sessionId: SessionId): State {
  const entry = attachedEntry(state, sessionId)

  if (!entry) return {tabs: [], focusedTabId: null}
  const focused = entry.focusedConnectionId === undefined ? undefined : entry.attachments.get(entry.focusedConnectionId)

  return {
    tabs: Array.from(entry.attachments.values()).flatMap((attachment) => (attachment.tab ? [attachment.tab] : [])),
    focusedTabId: focused?.tab?.id ?? null,
  }
}

function lastFocused(entry: AttachedSession) {
  const focused = entry.focusedConnectionId === undefined ? undefined : entry.attachments.get(entry.focusedConnectionId)

  if (entry.focusedConnectionId !== undefined && focused) return [entry.focusedConnectionId, focused] as const
  const newestFirst = Array.from(entry.attachments).toReversed()

  return newestFirst.find(([, attachment]) => attachment.tab?.visible) ?? newestFirst[0]
}

export function selectTarget(
  state: ConnectionState,
  sessionId: SessionId,
  action: Action,
):
  | {readonly ok: true; readonly connectionId: string; readonly tab: Tab | undefined}
  | {readonly ok: false; readonly error: Tool.Error} {
  const entry = state.status === 'active' ? state.sessions.get(sessionId) : undefined

  if (!entry || entry.status === 'revoking')
    return {
      ok: false,
      error: Tool.toolError({
        message:
          '[page.disconnected] No page is open in this session. Ask the user to open the page with the conciv panel and wait for it to connect. Then call page.tabs.list({}). Repeating page actions while disconnected will not help.',
      }),
    }

  if (entry.status === 'attaching')
    return {
      ok: false,
      error: Tool.toolError({
        message:
          '[page.disconnected] The page is still connecting to this session; no action ran. Call page.tabs.list({}) once it finishes connecting.',
      }),
    }

  if (action.type !== 'tabs.list' && action.tabId !== undefined) {
    const named = Array.from(entry.attachments).find(([, attachment]) => attachment.tab?.id === action.tabId)

    if (!named)
      return {
        ok: false,
        error: Tool.toolError({
          message:
            '[page.tab_unavailable] This tab is closed or does not belong to this session. Call page.tabs.list({}) and use an exact returned tabId, or omit tabId for the tab the user focused last. Never substitute an element ref for tabId.',
        }),
      }

    return {ok: true, connectionId: named[0], tab: named[1].tab}
  }
  const chosen = lastFocused(entry)

  if (!chosen) return {ok: false, error: disconnectedBeforeDispatch()}

  return {ok: true, connectionId: chosen[0], tab: chosen[1].tab}
}

function disconnectedBeforeDispatch() {
  return Tool.toolError({
    message:
      '[page.disconnected] The page disconnected before this action was sent; no action ran. Call page.tabs.list({}) once the page is open again.',
  })
}

function disconnectedAfterDispatch() {
  return Tool.toolError({
    message:
      '[page.disconnected] The page connection closed; the action may already have run. Call page.tabs.list({}) once the page is open again and inspect it with page.snapshot({}). Do not repeat clicks, fills or evaluations until their outcome is known.',
  })
}

function dispatchFailed(action: Method, error: unknown) {
  return Tool.toolError({
    message: `Could not dispatch page.${action}. Check that the page is open and call page.tabs.list({}) before deciding whether to retry.`,
    error,
  })
}

function timedOut(action: Method, timeoutMs: number) {
  return Tool.toolError({
    message: `[page.timeout] page.${action} did not finish within ${timeoutMs / 1000} seconds; its outcome is unknown. Call page.tabs.list({}) and inspect the page before you repeat a changing action.`,
  })
}
