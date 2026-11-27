import {Effect, Fiber, Scope, Stream, SubscriptionRef, type ManagedRuntime} from 'effect'
import {createMemo, from, onCleanup, type Accessor} from 'solid-js'
import {createStore} from 'solid-js/store'
import {createKeyed, type MountedSession, type SetupContext} from '@conciv/frontend-plugin-api'
import type {Grab} from '@conciv/frontend-plugin-api/grab'
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

export function createTerminalState(ctx: TerminalContext, runtime: TerminalRuntime, scope: Scope.Scope) {
  const readSession = createMemo((previous: MountedSession | undefined) => ctx.sessions.current() ?? previous)
  const readServer = createMemo(() => readSession()?.server)
  const readModels = createMemo(() => readServer()?.data.meta.models(() => readSession()?.id))
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
  const [held, setHeld] = createStore<{grabs: Grab[]}>({grabs: []})

  const meta = (sessionId: string) => {
    const models = readModels()
    return readSession()?.id === sessionId && models && !models.isPending ? models.data : undefined
  }
  const failed = (sessionId: string) => readSession()?.id === sessionId && readModels()?.isError === true
  const listedModels = (sessionId: string) => meta(sessionId)?.models ?? []
  const key = (sessionId: string) => `${sessionId}:${run().generation}`
  const busy = (sessionId: string) => {
    const live = run().live
    return live?.key === key(sessionId) && live.busy()
  }

  const locked = (sessionId: string) => run().restarting || busy(sessionId)

  const spawnModel = (sessionId: string) => {
    const listed = (model: string | null | undefined): model is string =>
      typeof model === 'string' && listedModels(sessionId).some((entry) => entry.id === model)
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
      return known ? known.harness.persistentPty === true : failed(sessionId)
    },
    meta,
    modelsFailed: (sessionId: string) => meta(sessionId) === undefined && failed(sessionId),
    modelsLoading: (sessionId: string) => meta(sessionId) === undefined && !failed(sessionId),
    reloadModels: () => void readModels()?.refetch(),
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
    held: () => held.grabs,
    hold: (grab: Grab) => setHeld('grabs', (grabs) => [...grabs, grab]),
    release: (index: number) => setHeld('grabs', (grabs) => grabs.toSpliced(index, 1)),
    takeHeld: () => {
      const taken = [...held.grabs]
      setHeld('grabs', [])
      return taken
    },
    pick: (session: MountedSession, model: string) =>
      send({
        type: 'model.picked',
        session,
        key: key(session.id),
        model,
        shown: shownModel(session.id),
        busy: busy(session.id),
      }),
    transport: (terminal: PtyClient, pty: HeldPty) => rpcTerminalTransport(runtime, terminal, pty, ctx.log),
  }
}

export type TerminalState = ReturnType<typeof createTerminalState>
