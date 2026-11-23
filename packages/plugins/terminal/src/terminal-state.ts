import {Effect, Fiber, Scope, Stream, SubscriptionRef, type ManagedRuntime} from 'effect'
import {createMemo, from, onCleanup, untrack, type Accessor} from 'solid-js'
import {createTanstackQueryUtils, useQuery} from '@conciv/client'
import {createKeyed, type MountedSession, type SetupContext} from '@conciv/plugin/experimental'
import type {terminalDeclarations} from './stores.js'
import {followDeletedSessions, runTerminal} from './terminal-driver.js'
import type {LiveTerminal, TerminalEvent} from './terminal-machine.js'
import {rpcTerminalTransport, type HeldPty, type PtyClient} from './terminal-transport.js'

export const PANEL_KEY = 'terminal:terminal'

export const OPEN_FAILED = 'Couldn’t open the terminal.'

export type TerminalContext = SetupContext<typeof terminalDeclarations>

export type TerminalRuntime = ManagedRuntime.ManagedRuntime<never, never>

type EventClient = MountedSession['server']['client']

function follow<A>(runtime: TerminalRuntime, ref: SubscriptionRef.SubscriptionRef<A>): Accessor<A> {
  return from<A>((set) => {
    const fiber = runtime.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => set(() => value))),
    )
    return () => void runtime.runFork(Fiber.interrupt(fiber))
  }, SubscriptionRef.getUnsafe(ref))
}

function readModels(ctx: TerminalContext, input: {sessionId: string}, options: {signal?: AbortSignal} = {}) {
  const session = untrack(() => ctx.sessions.current())
  if (!session || session.id !== input.sessionId)
    throw new Error(`the terminal read ${input.sessionId} after it was left`)
  return session.server.client.meta.models(input, options)
}

export function createTerminalState(ctx: TerminalContext, runtime: TerminalRuntime, scope: Scope.Scope) {
  const readSessionId = createMemo((previous: string | undefined) => ctx.sessions.current()?.id ?? previous)
  const modelsUtils = createTanstackQueryUtils(
    {terminal: (input: {sessionId: string}, options?: {signal?: AbortSignal}) => readModels(ctx, input, options)},
    {path: ['meta', 'models']},
  )
  const read = useQuery(() => ({
    ...modelsUtils.terminal.queryOptions({input: {sessionId: readSessionId() ?? ''}}),
    enabled: readSessionId() !== undefined,
    retry: false,
    refetchOnWindowFocus: false,
  }))
  const driver = runtime.runSync(
    runTerminal({
      toast: (message) => void ctx.toast.show({title: message, variant: 'error'}),
      savePrefs: (sessionId, model) =>
        ctx.stores.prefs.update((prefs) => {
          prefs.model = model
          prefs.sessions[sessionId] = model
        }),
    }).pipe(Scope.provide(scope)),
  )
  const run = follow(runtime, driver.state)
  const send = (event: TerminalEvent) => void runtime.runFork(driver.dispatch(event))

  const meta = (sessionId: string) => (readSessionId() === sessionId && !read.isPending ? read.data : undefined)
  const models = (sessionId: string) => meta(sessionId)?.models ?? []
  const key = (sessionId: string) => `${sessionId}:${run().generation}`
  const busy = (sessionId: string) => {
    const live = run().live
    return live?.key === key(sessionId) && live.busy()
  }

  const locked = (sessionId: string) => run().restarting || busy(sessionId)

  const spawnModel = (sessionId: string) => {
    const listed = (model: string | null | undefined): model is string =>
      typeof model === 'string' && models(sessionId).some((entry) => entry.id === model)
    const picked = [ctx.stores.prefs.value.sessions[sessionId], ctx.stores.prefs.value.model].find(listed)
    return picked ?? meta(sessionId)?.defaultModel ?? undefined
  }

  const shownModel = (sessionId: string) => {
    const live = run().live
    return live?.key === key(sessionId) && !run().restarting ? live.model : spawnModel(sessionId)
  }

  const restart = (session: MountedSession) => send({type: 'restart.requested', session, key: key(session.id)})

  const readClient = createMemo(
    (previous: EventClient | undefined) => ctx.sessions.current()?.server.client ?? previous,
  )
  createKeyed(readClient, (client) => {
    const forget = (sessionId: string) =>
      ctx.stores.prefs.update((prefs) => {
        delete prefs.sessions[sessionId]
      })
    const fiber = runtime.runFork(followDeletedSessions(client, forget))
    onCleanup(() => void runtime.runFork(Fiber.interrupt(fiber)))
  })

  createKeyed(
    () => {
      const session = ctx.sessions.current()
      const live = run().live
      if (!session || live?.key !== key(session.id) || meta(session.id) === undefined) return undefined
      if (locked(session.id)) return undefined
      const model = spawnModel(session.id)
      return model === live.model ? undefined : {session, key: live.key, model}
    },
    (behind) => restart(behind.session),
    {equals: (previous, next) => previous.key === next.key && previous.model === next.model},
  )

  return {
    supported: (sessionId: string) => meta(sessionId)?.harness.persistentPty,
    ready: (sessionId: string) => {
      const known = meta(sessionId)
      return known ? known.harness.persistentPty === true : read.errorUpdateCount > 0
    },
    meta,
    modelsFailed: (sessionId: string) => meta(sessionId) === undefined && read.isError,
    modelsLoading: (sessionId: string) => meta(sessionId) === undefined && !read.isError,
    reloadModels: () => void read.refetch(),
    spawnModel,
    shownModel,
    key,
    busy,
    locked,
    failure: (sessionId: string) => {
      const failure = run().failure
      return failure?.key === key(sessionId) ? failure.message : null
    },
    opened: (live: LiveTerminal) => send({type: 'opened', live}),
    closed: (terminalKey: string) => send({type: 'closed', key: terminalKey}),
    fail: (terminalKey: string, message: string) => send({type: 'failed', key: terminalKey, message}),
    retry: () => send({type: 'retried'}),
    restart,
    pick: (session: MountedSession, model: string) =>
      send({
        type: 'model.picked',
        session,
        key: key(session.id),
        model,
        shown: shownModel(session.id),
        busy: busy(session.id),
      }),
    transport: (terminal: PtyClient, pty: HeldPty) => rpcTerminalTransport(runtime, terminal, pty),
  }
}

export type TerminalState = ReturnType<typeof createTerminalState>
