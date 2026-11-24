import {Effect, ManagedRuntime, Queue, Schema, Stream} from 'effect'
import type {BrowserCommandContext} from 'vitest/node'
import {EventEnvelopeSchema} from '@conciv/contract'
import {Bus, Event, EventManifest, Location, Rpc} from '@conciv/plugin-host'
import {PluginEngine} from './plugin-engine.js'
import type {EngineCommands, EngineEvent, EngineOutcome} from './browser-commands.js'

const makeRuntime = (options: PluginEngine.Options) => ManagedRuntime.make(PluginEngine.layer(options))

type EngineRuntime = ReturnType<typeof makeRuntime>

type RunningEngine = {
  runtime: EngineRuntime
  sessions: Record<string, PluginEngine.EngineSession>
  feeds: Record<string, AsyncIterator<EngineEvent>>
}

type EngineCommandHandlers = {
  [Name in keyof EngineCommands]: (
    context: BrowserCommandContext,
    ...args: Parameters<EngineCommands[Name]>
  ) => ReturnType<EngineCommands[Name]>
}

const ServerEvent = Schema.Union(EventManifest.ServerDefinitions)

const isRpcType = (type: string): type is `rpc.${string}` => type.startsWith('rpc.')

const isPublic = (event: Event.Payload) => EventManifest.isServer(event) || isRpcType(event.type)

function encodeEvent(event: Event.Payload): EngineEvent {
  const definition = isRpcType(event.type) ? Rpc.eventDefinition(event.type) : ServerEvent
  return EventEnvelopeSchema.parse(Schema.encodeUnknownSync(definition)(event))
}

const publicEvents = Stream.unwrap(
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const queue = yield* Queue.unbounded<EngineEvent>()
    const stop = yield* bus.listen((event) =>
      isPublic(event) ? Queue.offer(queue, encodeEvent(event)).pipe(Effect.asVoid) : Effect.void,
    )
    yield* Effect.addFinalizer(() => stop)
    const connected: EngineEvent = {id: Event.Id.create(), type: 'server.connected', data: {}}
    return Stream.make(connected).pipe(Stream.concat(Stream.fromQueue(queue)))
  }),
)

function rpcOutcome(runtime: EngineRuntime, rpcId: string, method: string, input: unknown): Promise<EngineOutcome> {
  return runtime.runPromise(
    PluginEngine.call(rpcId, method, input).pipe(
      Effect.match({
        onSuccess: (value): EngineOutcome => ({ok: true, value}),
        onFailure: (failure): EngineOutcome => ({ok: false, failure}),
      }),
    ),
  )
}

export function engineCommands(): EngineCommandHandlers {
  const engines: Record<string, RunningEngine> = {}
  const counter = {next: 0}
  const nextId = () => {
    counter.next += 1
    return String(counter.next)
  }
  const engineFor = (engineId: string): RunningEngine => {
    const found = engines[engineId]
    if (found === undefined) throw new Error(`no plugin engine ${engineId}: it was never made or has stopped`)
    return found
  }
  const sessionFor = (engineId: string, sessionId: string): PluginEngine.EngineSession => {
    const found = engineFor(engineId).sessions[sessionId]
    if (found === undefined) throw new Error(`plugin engine ${engineId} has no session ${sessionId}`)
    return found
  }
  return {
    concivPluginEngineStart: async (_context, options) => {
      const runtime = makeRuntime(options)
      const session = await runtime.runPromise(PluginEngine.session({title: 'Test session'}))
      const location = await runtime.runPromise(Effect.service(Location.Service))
      const id = nextId()
      engines[id] = {runtime, sessions: {[session.id]: session}, feeds: {}}
      return {id, sessionId: session.id, directory: location.directory}
    },
    concivPluginEngineStop: async (_context, engineId) => {
      const found = engines[engineId]
      delete engines[engineId]
      await Promise.all(Object.values(found?.feeds ?? {}).map((feed) => feed.return?.()))
      await found?.runtime.dispose()
    },
    concivPluginEngineCall: (_context, engineId, rpcId, method, input) =>
      rpcOutcome(engineFor(engineId).runtime, rpcId, method, input),
    concivPluginEngineTool: (_context, engineId, sessionId, name, input) =>
      engineFor(engineId).runtime.runPromise(sessionFor(engineId, sessionId).tool(name).answer(input)),
    concivPluginEngineToolFailure: (_context, engineId, sessionId, name, input) =>
      engineFor(engineId).runtime.runPromise(sessionFor(engineId, sessionId).tool(name).failure(input)),
    concivPluginEngineWrite: (_context, engineId, path, content) =>
      engineFor(engineId).runtime.runPromise(PluginEngine.write(path, content)),
    concivPluginEngineEventsOpen: async (_context, engineId) => {
      const engine = engineFor(engineId)
      const context = await engine.runtime.context()
      const feedId = nextId()
      engine.feeds[feedId] = Stream.toAsyncIterableWith(publicEvents, context)[Symbol.asyncIterator]()
      return feedId
    },
    concivPluginEngineEventsNext: async (_context, engineId, feedId) => {
      const feed = engineFor(engineId).feeds[feedId]
      if (feed === undefined) return undefined
      const next = await feed.next()
      return next.done === true ? undefined : next.value
    },
    concivPluginEngineEventsClose: async (_context, engineId, feedId) => {
      const engine = engines[engineId]
      const feed = engine?.feeds[feedId]
      if (engine !== undefined) delete engine.feeds[feedId]
      await feed?.return?.()
    },
  }
}
