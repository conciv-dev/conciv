import {once} from 'node:events'
import {keyBy, Mutex, TimeoutError, withTimeout} from 'es-toolkit'
import type {SessionId} from '@conciv/protocol/chat-types'
import {PAGE_QUEUE_REFUSED} from '@conciv/protocol/page-types'
import {Tool, type Plugin, type Rule, type RpcRegistration} from '@conciv/plugin'
import {
  ACCESS,
  PERMISSION_SYNC_TIMEOUT_MS,
  createConnectionState,
  isAttachedConnection,
  isConnectionDisposed,
  reconcilePagePermissions,
  selectNextAttempt,
  selectPendingCommand,
  selectTabs,
  selectTarget,
  transitionConnection,
  type AttachmentOutcome,
  type ConnectionEffect,
  type ConnectionEvent,
  type RequestSettlement,
} from './machine.js'
import * as Queue from './queue.js'
import * as Records from './records.js'
import {Definition, Operations, type Action, type Command, type Result, type Tab} from './rpc.js'

const DEFAULT_TIMEOUT_MS = 5000

const TAB_RETURN_MS = 5000

const QUEUED_ACTION_MS = 7000

const EVAL_ASK: Rule = {action: 'page_eval', resource: '*', effect: 'ask'}

const TRANSPORT_CODES = ['disconnected', 'timeout', 'tab_unavailable']

const operations = keyBy(Operations, (operation) => operation.name)

type SyncEffect = Extract<ConnectionEffect, {readonly type: 'sync-permissions'}>

type Call = {readonly agentId: string; readonly signal?: AbortSignal | undefined}

export type Connection = Awaited<ReturnType<typeof make>>

export function raise(error: Tool.Error): Error {
  return Object.assign(new Error(error.message, {cause: error.error}), error)
}

function refused(error: Tool.Error): RequestSettlement {
  const message = `the page refused the queue, so this action did not run: ${error.message}`
  return {ok: false, error: Tool.toolError({message, error: {code: PAGE_QUEUE_REFUSED, message}})}
}

function whenAborted(signal: AbortSignal | undefined): Promise<'aborted'> {
  if (!signal) return new Promise(() => {})
  if (signal.aborted) return Promise.resolve('aborted')
  return once(signal, 'abort').then(() => 'aborted')
}

function callTimeout(action: Action): number {
  if ((action.type === 'wait' || action.type === 'hmr') && action.timeout !== undefined) return action.timeout + 1000
  return DEFAULT_TIMEOUT_MS
}

export async function make(ctx: Pick<Plugin.Context, 'agent' | 'rpc' | 'session' | 'location' | 'event' | 'storage'>) {
  await ctx.agent.transform((editor) =>
    editor
      .list()
      .forEach((agent) =>
        agent.permissions.push(...ACCESS.map((rule) => ({...rule, effect: 'deny' as const})), EVAL_ASK),
      ),
  )
  const machine = {state: createConnectionState()}
  const records = Records.fromStorage(ctx.storage)
  const queues = Queue.fromPlay({
    play: (sessionId, play) => playQueue(sessionId, play),
    journal: (sessionId, change) => records.append(sessionId, change),
    finished: (record) => {
      if (record.result === null) return
      const {sessionId, queueId, toolCallId, result} = record
      void registration.events
        .emit('queue.finished', {sessionId, queueId, toolCallId, result})
        .catch((error: unknown) => console.warn(`Announcing queue ${queueId} failed`, error))
    },
  })
  const attachments = new Map<number, PromiseWithResolvers<AttachmentOutcome>>()
  const requests = new Map<string, PromiseWithResolvers<RequestSettlement>>()
  const lanes = new Map<SessionId, Mutex>()
  const drained = Promise.withResolvers<void>()
  const changed = new EventTarget()
  const lock = new Mutex()
  const stopped = new AbortController()
  const step = async (event: ConnectionEvent): Promise<void> => {
    const next = transitionConnection(machine.state, event)
    machine.state = next.state
    for (const effect of next.effects)
      await perform(effect).catch((error: unknown) => console.warn('Page effect failed', error))
    changed.dispatchEvent(new Event('changed'))
  }
  const dispatch = async (event: ConnectionEvent): Promise<void> => {
    await lock.acquire()
    try {
      await step(event)
    } finally {
      lock.release()
    }
  }
  const perform = async (effect: ConnectionEffect): Promise<void> => {
    if (effect.type === 'sync-permissions') {
      void syncPermissions(effect)
      return
    }
    if (effect.type === 'close-attachment') {
      const attachment = attachments.get(effect.attempt)
      if (!attachment) return
      attachments.delete(effect.attempt)
      attachment.resolve(effect.outcome)
      return
    }
    if (effect.type === 'emit-control') return registration.events.emit('control', effect.control)
    if (effect.type === 'dispatch-command')
      return registration.events
        .emit('control', {type: 'command', connectionId: effect.connectionId, requestId: effect.requestId})
        .catch((error: unknown) => step({...effect, type: 'request.dispatch-failed', error}))
    if (effect.type === 'settle-request') {
      const result = requests.get(effect.requestId)
      if (!result) return
      requests.delete(effect.requestId)
      result.resolve(effect.settlement)
      return
    }
    if (effect.type === 'warn') {
      console.warn(effect.message, effect.error)
      return
    }
    drained.resolve()
  }
  const begin = async (sessionId: SessionId, connectionId: string) => {
    await lock.acquire()
    try {
      if (isConnectionDisposed(machine.state)) return undefined
      const attempt = selectNextAttempt(machine.state)
      const closed = Promise.withResolvers<AttachmentOutcome>()
      attachments.set(attempt, closed)
      await step({type: 'attach.started', sessionId, attempt, connectionId})
      return {attempt, closed}
    } finally {
      lock.release()
    }
  }
  const syncPermissions = async (effect: SyncEffect): Promise<void> => {
    const synced = {sessionId: effect.sessionId, attempt: effect.attempt}
    const event: ConnectionEvent = await withTimeout(async () => {
      const session = await ctx.session.get({sessionId: effect.sessionId})
      const permissions = reconcilePagePermissions(session.permissions, effect.allow)
      if (permissions) await ctx.session.update({sessionId: effect.sessionId, permissions})
    }, PERMISSION_SYNC_TIMEOUT_MS).then(
      (): ConnectionEvent => ({type: 'permissions.synced', ...synced}),
      (error: unknown): ConnectionEvent =>
        error instanceof TimeoutError
          ? {type: 'permissions.timed-out', ...synced}
          : {type: 'permissions.failed', ...synced, error},
    )
    await dispatch(event)
  }
  const registration: RpcRegistration<typeof Definition> = await ctx.rpc.register(Definition, {
    attach: async (input, call) => {
      const session = await ctx.session.get({sessionId: input.sessionId}).catch(() => undefined)
      if (!session) return call.error('unavailable', 'Session not found.', {})
      if (session.location.directory !== ctx.location.directory)
        return call.error('unavailable', 'Session belongs to another location.', {})
      const started = await begin(input.sessionId, input.connectionId)
      if (!started) return call.error('unavailable', 'Page is unavailable.', {})
      try {
        const outcome = await Promise.race([
          started.closed.promise,
          whenAborted(call.signal).then((): AttachmentOutcome => 'closed'),
        ])
        if (outcome === 'unavailable') return call.error('unavailable', 'Page permissions could not be granted.', {})
        return outcome
      } finally {
        await dispatch({type: 'attach.closed', sessionId: input.sessionId, attempt: started.attempt})
      }
    },
    state: async (input, call) => {
      if (!isAttachedConnection(machine.state, input.sessionId, input.connectionId))
        return call.error('unavailable', 'Page is unavailable.', {})
      await dispatch({
        type: 'state.updated',
        sessionId: input.sessionId,
        connectionId: input.connectionId,
        tab: input.state,
      })
    },
    command: async (input, call) =>
      selectPendingCommand(machine.state, input.sessionId, input.connectionId, input.requestId) ??
      call.error('unavailable', 'Page request is no longer available.', {}),
    result: async (input, call) => {
      if (input.outcome.type === 'failure' && TRANSPORT_CODES.includes(input.outcome.code))
        return call.error('unavailable', `The page cannot report ${input.outcome.code}; only the engine does.`, {})
      if (!isAttachedConnection(machine.state, input.sessionId, input.connectionId))
        return call.error('unavailable', 'Page is unavailable.', {})
      await dispatch({type: 'request.settled', ...input})
    },
    'hmr.wait': async (input, call) => {
      try {
        const result = await target(input.sessionId, {type: 'hmr', timeout: input.timeout}).request({
          agentId: 'engine',
          signal: call.signal,
        })
        return Definition.methods['hmr.wait'].output.parse(result.value)
      } catch (error) {
        return call.error('unavailable', error instanceof Error ? error.message : String(error), {})
      }
    },
    changes: (input) => records.changes(input.sessionId),
    clearChanges: async (input) => {
      await records.clear(input.sessionId)
      return {ok: true as const}
    },
    'captures.list': (input) => records.captures(input.sessionId),
    'queue.wait': async (input, call) => {
      try {
        return await queues.wait(input.sessionId, input.queueId, input.waitMs, call.signal)
      } catch (error) {
        return call.error('unavailable', error instanceof Error ? error.message : String(error), {})
      }
    },
    'queue.startedBy': async (input) => queues.startedBy(input.sessionId, input.toolCallIds),
    'queue.undelivered': async (input) => queues.undelivered(input.sessionId, input),
    'queue.owed': async (input) => queues.owed(input.sessionId, input.excludeToolCallIds, input.claim),
    'queue.settle': async (input) => {
      queues.settle(input.sessionId, input.queueIds, input.delivery)
      return {ok: true as const}
    },
  })
  void watchDeletions()
  async function watchDeletions(): Promise<void> {
    const events = ctx.event.subscribe({types: ['session.deleted'], signal: stopped.signal})
    try {
      for await (const event of events) {
        lanes.delete(event.data.sessionID)
        await records.forget(event.data.sessionID)
        await dispatch({type: 'session.deleted', sessionId: event.data.sessionID})
      }
    } catch (error) {
      if (!stopped.signal.aborted) console.warn('Page stopped following deleted sessions', error)
    }
  }

  async function request(
    sessionId: SessionId,
    connectionId: string,
    command: Command,
    signal: AbortSignal | undefined,
  ): Promise<RequestSettlement> {
    signal?.throwIfAborted()
    const requestId = crypto.randomUUID()
    const ids = {sessionId, connectionId, requestId}
    const result = Promise.withResolvers<RequestSettlement>()
    requests.set(requestId, result)
    try {
      await dispatch({type: 'request.started', ...ids, command})
      const first = await Promise.race([
        result.promise,
        whenAborted(AbortSignal.timeout(command.timeoutMs)).then(() => 'timeout' as const),
        whenAborted(signal).then(() => 'cancelled' as const),
      ])
      if (first === 'timeout') {
        await dispatch({type: 'request.timed-out', ...ids})
        return await result.promise
      }
      if (first === 'cancelled') {
        await dispatch({type: 'request.cancelled', ...ids})
        throw signal?.reason
      }
      return first
    } finally {
      requests.delete(requestId)
    }
  }

  async function servingAgain(sessionId: SessionId, action: Action, until: AbortSignal) {
    for (;;) {
      const selected = selectTarget(machine.state, sessionId, action)
      if (selected.ok) return selected
      await once(changed, 'changed', {signal: until})
    }
  }

  function lane(sessionId: SessionId): Mutex {
    const existing = lanes.get(sessionId)
    if (existing) return existing
    const created = new Mutex()
    lanes.set(sessionId, created)
    return created
  }

  function target(sessionId: SessionId, action: Action) {
    const selected = selectTarget(machine.state, sessionId, action)
    if (!selected.ok) throw raise(selected.error)
    const mutating = operations[action.type].mutating
    const send = async (call: Call): Promise<Result> => {
      const command = {action, agentId: call.agentId, timeoutMs: callTimeout(action)}
      const deadline = Date.now() + command.timeoutMs
      const first = await request(sessionId, selected.connectionId, command, call.signal)
      if (first.ok) return first.result
      if (mutating || first.tabClosed !== true) throw raise(first.error)
      const remaining = Math.max(Math.min(TAB_RETURN_MS, deadline - Date.now()), 0)
      const until = call.signal
        ? AbortSignal.any([AbortSignal.timeout(remaining), call.signal])
        : AbortSignal.timeout(remaining)
      const returned = await servingAgain(sessionId, action, until).catch(() => undefined)
      call.signal?.throwIfAborted()
      if (!returned) throw raise(first.error)
      const again = await request(
        sessionId,
        returned.connectionId,
        {...command, timeoutMs: Math.max(deadline - Date.now(), 1)},
        call.signal,
      )
      if (again.ok) return again.result
      throw raise(again.error)
    }
    return {
      tab: selected.tab,
      request: async (call: Call): Promise<Result> => {
        if (!mutating) return send(call)
        const serial = lane(sessionId)
        await serial.acquire()
        try {
          return await send(call)
        } finally {
          serial.release()
        }
      },
    }
  }

  function playQueue(
    sessionId: SessionId,
    play: {
      readonly action: Action
      readonly agentId: string
      readonly queueId: string
      readonly actions: readonly Action[]
    },
  ): Promise<RequestSettlement>[] {
    const selected = selectTarget(machine.state, sessionId, play.action)
    if (!selected.ok) throw raise(selected.error)
    const of = play.actions.length
    const played = play.actions.map(() => Promise.withResolvers<RequestSettlement>())
    const queued = (index: number) => ({id: play.queueId, index, of})
    const send = (action: Action, index: number, timeoutMs: number) =>
      request(
        sessionId,
        selected.connectionId,
        {action, agentId: play.agentId, timeoutMs, queued: queued(index)},
        undefined,
      )
    const run = async () => {
      const serial = lane(sessionId)
      await serial.acquire()
      try {
        const acceptance = await send(play.action, -1, DEFAULT_TIMEOUT_MS)
        for (const [index, action] of play.actions.entries())
          played[index]?.resolve(
            acceptance.ok ? await send(action, index, QUEUED_ACTION_MS) : refused(acceptance.error),
          )
      } finally {
        serial.release()
      }
    }
    void run().catch((error: unknown) =>
      played.forEach((each) =>
        each.resolve({
          ok: false,
          error: Tool.toolError({message: `The queue could not be played: ${String(error)}`, error}),
        }),
      ),
    )
    return played.map((each) => each.promise)
  }

  return {
    target,
    queues,
    records,
    tabs: (sessionId: SessionId): {tabs: Tab[]; focusedTabId: string | null} => selectTabs(machine.state, sessionId),
    dispose: async (): Promise<void> => {
      await dispatch({type: 'disposed'})
      await drained.promise
      stopped.abort()
    },
  }
}
