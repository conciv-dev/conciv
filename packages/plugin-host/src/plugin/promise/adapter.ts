import {Tool} from '../../schema/tool.js'
import {Agent} from '../../schema/agent.js'
import {SessionMessage} from '../../schema/session-message.js'
import type {Rpc} from '../../schema/rpc.js'
import {EventManifest} from '../../schema/event-manifest.js'
import {Location} from '../../schema/location.js'
import {Model} from '../../schema/model.js'
import {Permission} from '../../schema/permission.js'
import {Plugin as PluginSchema} from '../../schema/plugin.js'
import {Session} from '../../schema/session.js'
import {Skill} from '../../schema/skill.js'
import {PositiveInt} from '../../schema/schema.js'
import {eventDefinition} from '../../core/rpc.js'
import type {
  ConcivEvent,
  Info,
  Plugin,
  RpcCallOptions,
  RpcDomain,
  RpcEventPayload,
  RpcHandlers,
  SelectedEvent,
  SubscribeOptions,
  Tool as PromiseTool,
} from '@conciv/plugin'
import {Effect, Schema, Stream} from 'effect'
import type {Scope} from 'effect'
import {define} from '../effect/plugin.js'
import type {ToolFailures, ToolHooks} from '../effect/tool.js'
import {AssertInput} from '../permission.js'

type HostRegistration = {readonly dispose: Effect.Effect<void>}
type Registration = {readonly dispose: () => Promise<void>}
type PromiseContext = Plugin.Context
type HostRpc = Parameters<Parameters<typeof define>[0]['effect']>[0]['rpc']
type StreamAdapter = <A, E>(stream: Stream.Stream<A, E>, options?: {readonly signal?: AbortSignal}) => AsyncIterable<A>

interface MethodSchemas {
  readonly input?: RuntimeSchema
  readonly output?: RuntimeSchema
}

const JsonInput = Schema.fromJsonString(Schema.Unknown)

const LocationQuery = Schema.Struct({
  location: Schema.optional(
    Schema.Struct({
      directory: Schema.optional(Schema.String),
    }),
  ),
}).annotate({identifier: 'LocationQuery'})

const ModelListQuery = Schema.Struct({
  ...LocationQuery.fields,
  types: Schema.optional(Schema.ArrayEnsure(Model.Type)).annotate({
    description: 'Only list models of these types. Defaults to chat, the only type offered for sessions.',
  }),
})

const ModelListSchemas = {
  input: Schema.toType(ModelListQuery),
  output: Location.response(Schema.Array(Model.Info)),
}
const ModelDefaultSchemas = {
  input: Schema.toType(LocationQuery),
  output: Location.response(Schema.UndefinedOr(Model.Info)),
}
const PermissionListSchemas = {
  input: Schema.Struct({sessionId: Session.Id}),
  output: Schema.Array(Permission.Request),
}
const PermissionGetSchemas = {
  input: Schema.Struct({sessionId: Session.Id, requestId: Permission.Id}),
  output: Permission.Request,
}
const PermissionReplySchemas = {
  input: Schema.Struct({
    sessionId: Session.Id,
    requestId: Permission.Id,
    decision: Permission.Reply,
    message: Schema.String.pipe(Schema.optional),
  }),
}
const passingUnknownKeys = <Fields extends Schema.Struct.Fields>(fields: Fields) => ({
  input: Schema.StructWithRest(Schema.Struct(fields), [Schema.Record(Schema.String, Schema.Unknown)]),
})
const SessionCreateSchemas = passingUnknownKeys({id: Schema.optional(Session.Id)})
const SessionIdSchemas = passingUnknownKeys({sessionId: Session.Id})
const SessionListSchemas = passingUnknownKeys({
  limit: Schema.optional(PositiveInt),
  search: Schema.optional(Schema.String),
  archived: Schema.optional(Schema.Boolean),
})
const PluginListSchemas = {
  input: Schema.toType(LocationQuery),
  output: Location.response(Schema.Array(PluginSchema.Info)),
}
const SkillListSchemas = {
  input: Schema.toType(LocationQuery),
  output: Location.response(Schema.Array(Skill.Info)),
}
const ServerEvent = Schema.Union(EventManifest.ServerDefinitions)

const ToolContextIds = Schema.Struct({
  agent: Agent.Id,
  messageId: Schema.UndefinedOr(SessionMessage.Id),
  id: Tool.CallId,
})

const isRpcType = (type: string): type is `rpc.${string}` => type.startsWith('rpc.')

interface HostRpcCallContext {
  readonly error: (type: string, message: string, data?: unknown) => unknown
}

const ReturnedRpcError = Schema.TaggedStruct('ReturnedRpcError', {
  type: Schema.String,
  message: Schema.String,
  data: Schema.optional(Schema.Unknown),
})
type ReturnedRpcError = typeof ReturnedRpcError.Type & globalThis.Error

const makeReturnedRpcError = (type: string, message: string, data?: unknown): ReturnedRpcError =>
  Object.assign(new globalThis.Error(message), ReturnedRpcError.make({type, message, data}))

const isReturnedRpcError = (error: unknown): error is ReturnedRpcError =>
  error instanceof globalThis.Error && Schema.is(ReturnedRpcError)(error)

const makeStreams = Effect.fn('Plugin.Event.makeStreams')(function* () {
  const context = yield* Effect.context<Scope.Scope>()
  const subscriptions = new Set<() => Promise<IteratorResult<unknown>>>()
  yield* Effect.addFinalizer(() => Effect.promise(() => Promise.all(Array.from(subscriptions, (close) => close()))))

  return (<A, E>(stream: Stream.Stream<A, E>, options?: {readonly signal?: AbortSignal}): AsyncIterable<A> => ({
    [Symbol.asyncIterator]() {
      const iterator = Stream.toAsyncIterableWith(stream, context)[Symbol.asyncIterator]()
      const close = () => {
        subscriptions.delete(close)
        options?.signal?.removeEventListener('abort', abort)
        return iterator.return?.() ?? Promise.resolve({done: true as const, value: undefined})
      }
      const abort = () => {
        void close()
      }
      subscriptions.add(close)
      options?.signal?.addEventListener('abort', abort, {once: true})
      if (options?.signal?.aborted) abort()
      return {
        next: () =>
          iterator.next().then(
            (result) => (result.done ? close().then(() => result) : result),
            (error: unknown) => close().then(() => Promise.reject(error)),
          ),
        return: close,
      }
    },
  })) satisfies StreamAdapter
})

const rpcFromEffect = Effect.fn('Plugin.Rpc.fromEffect')(function* (host: HostRpc, streams: StreamAdapter) {
  const context = yield* Effect.context<Scope.Scope>()
  const run = Effect.runPromiseWith(context)

  const client = (definition: Rpc.PortableDefinition) => {
    const local = host(definition)
    const subscribe = (
      name: string,
      options?: Pick<RpcCallOptions, 'signal'>,
    ): AsyncIterable<RpcEventPayload<Rpc.PortableDefinition>> => streams(local.events.subscribe(name), options)
    return Object.assign(
      Object.fromEntries(
        Object.keys(definition.methods).map((name) => [
          name,
          (input: unknown, options?: Pick<RpcCallOptions, 'signal'>) => {
            const method = local[name] as (input: unknown) => Effect.Effect<unknown, unknown>
            return run(method(input), {signal: options?.signal})
          },
        ]),
      ),
      {
        events: {
          subscribe,
          on: (
            name: string,
            handler: (event: RpcEventPayload<Rpc.PortableDefinition>) => Promise<void> | void,
            options?: Pick<RpcCallOptions, 'signal'>,
          ) => {
            const controller = new AbortController()
            const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
            void (async () => {
              for await (const event of subscribe(name, {signal})) await handler(event)
            })().catch((error: unknown) => run(Effect.logError(error)))
            return () => controller.abort()
          },
        },
      },
    )
  }

  const register = (definition: Rpc.PortableDefinition, handlers: RpcHandlers<Rpc.PortableDefinition>) =>
    run(
      host.register(
        definition,
        Object.fromEntries(
          Object.entries(handlers).map(([name, handler]) => [
            name,
            (input: unknown, context: HostRpcCallContext) =>
              Effect.tryPromise({
                try: (signal) => {
                  return Reflect.apply(handler, undefined, [
                    input,
                    {
                      signal,
                      error: (type: string, message: string, data?: unknown) =>
                        makeReturnedRpcError(type, message, data),
                    },
                  ]) as Promise<unknown>
                },
                catch: (error) => hostRpcError(context, error),
              }).pipe(
                Effect.flatMap((result) =>
                  isReturnedRpcError(result) ? Effect.fail(hostRpcError(context, result)) : Effect.succeed(result),
                ),
              ),
          ]),
        ) as never,
      ),
    ).then((registration) => ({
      dispose: () => run(registration.dispose),
      events: {emit: (...args: Rpc.EventInput<Rpc.PortableDefinition>) => run(registration.events.emit(...args))},
    }))

  return Object.assign(client, {register}) as RpcDomain
})

function hostRpcError(context: HostRpcCallContext, error: unknown) {
  if (!isReturnedRpcError(error)) return error
  return context.error(error.type, error.message, error.data)
}

export function fromPromise(plugin: Plugin.Plugin) {
  return define({
    id: plugin.id,
    effect: (host) =>
      Effect.gen(function* () {
        const encodeEvent = (event: {readonly type: string}) =>
          Schema.encodeUnknownEffect(isRpcType(event.type) ? eventDefinition(event.type) : ServerEvent)(event)
        const runtime = yield* Effect.context<Scope.Scope>()
        const streams = yield* makeStreams()

        const register = (effect: Effect.Effect<HostRegistration, never, Scope.Scope>): Promise<Registration> =>
          Effect.runPromiseWith(runtime)(effect).then((registration) => ({
            dispose: () => Effect.runPromiseWith(runtime)(registration.dispose),
          }))

        const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseWith(runtime)(effect)

        const promiseExecutor =
          (execute: Tool.Info['execute']): Info['execute'] =>
          (input, context) =>
            Effect.runPromiseWith(runtime)(
              Schema.decodeUnknownEffect(ToolContextIds)(context).pipe(
                Effect.flatMap((ids) =>
                  execute(input, {
                    ...context,
                    ...ids,
                    progress: (update) => Effect.promise(() => context.progress(update)),
                  }),
                ),
              ),
              {signal: context.signal},
            )

        const adaptMethod = <PromiseMethod>(
          schemas: MethodSchemas,
          method: (input: never) => Effect.Effect<unknown, unknown>,
        ) => {
          const decode = schemas.input === undefined ? Effect.succeed : Schema.decodeUnknownEffect(schemas.input)
          const encode = schemas.output === undefined ? Effect.succeed : Schema.encodeUnknownEffect(schemas.output)
          return ((input?: unknown) =>
            Effect.gen(function* () {
              const normalized = yield* Schema.encodeUnknownEffect(JsonInput)(input ?? {}).pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(JsonInput)),
              )
              const decoded = yield* decode(normalized)
              const result = yield* method(decoded as never)
              return yield* encode(result)
            }).pipe(Effect.runPromiseWith(runtime))) as PromiseMethod
        }

        const transform =
          <Editor>(domain: {
            transform: (callback: (editor: Editor) => void) => Effect.Effect<HostRegistration, never, Scope.Scope>
          }) =>
          (callback: (editor: Editor) => void) =>
            register(
              domain.transform((editor) => {
                callback(editor)
              }),
            )

        const context2: PromiseContext = {
          app: host.app,
          location: host.location,
          options: host.options,
          agent: {
            transform: transform(host.agent),
          },
          event: {
            subscribe: <Type extends Exclude<ConcivEvent['type'], 'server.connected'>>(
              options?: SubscribeOptions<Type>,
            ) =>
              streams(
                host.event.subscribe({types: options?.types}).pipe(
                  Stream.mapEffect((event) => encodeEvent(event)),
                  Stream.map((event) => event as SelectedEvent<ConcivEvent, Type>),
                ),
                options,
              ),
          },
          experimental: {
            generate: undefined,
          },
          model: {
            list: adaptMethod(ModelListSchemas, host.model.list),
            default: adaptMethod(ModelDefaultSchemas, host.model.default),
            transform: undefined,
            reload: undefined,
          },
          permission: {
            hook: undefined,
            list: adaptMethod(PermissionListSchemas, host.permission.list),
            get: adaptMethod(PermissionGetSchemas, host.permission.get),
            reply: adaptMethod(PermissionReplySchemas, host.permission.reply),
            assert: (input) =>
              run(Schema.decodeUnknownEffect(AssertInput)(input).pipe(Effect.flatMap(host.permission.assert))),
          },
          plugin: {
            list: adaptMethod(PluginListSchemas, host.plugin.list),
          },
          rpc: yield* rpcFromEffect(host.rpc, streams),
          skill: {
            list: adaptMethod(SkillListSchemas, host.skill.list),
            transform: transform(host.skill),
            reload: () => run(host.skill.reload()),
          },
          storage: {
            get directory() {
              return host.storage.directory
            },
            get: (key) => run(host.storage.get(key)),
            set: (key, value) => run(host.storage.set(key, value)),
            remove: (key) => run(host.storage.remove(key)),
            scan: (options) => run(host.storage.scan(options)),
          },
          tool: {
            reload: () => run(host.tool.reload()),
            list: () =>
              run(host.tool.list()).then((tools) =>
                tools.map((tool) => ({...tool, ...promiseSchemas(tool), execute: promiseExecutor(tool.execute)})),
              ),
            transform: (callback) =>
              register(
                host.tool.transform((editor) =>
                  callback({
                    list: () =>
                      editor
                        .list()
                        .map((tool) => ({...tool, ...promiseSchemas(tool), execute: promiseExecutor(tool.execute)})),
                    get: (id) => {
                      const tool = editor.get(id)
                      return tool
                        ? {...tool, ...promiseSchemas(tool), execute: promiseExecutor(tool.execute)}
                        : undefined
                    },
                    namespace: editor.namespace,
                    add: (tool: Info) =>
                      editor.add({
                        ...tool,
                        execute: (input, context) => executePromiseTool(tool, input, context),
                      }),
                    update: (id, update) =>
                      editor.update(id, (tool) => {
                        const value: Info = {
                          ...tool,
                          ...promiseSchemas(tool),
                          execute: promiseExecutor(tool.execute),
                        }
                        update(value)
                        Object.assign(tool, value, {
                          output: value.output,
                          options: value.options,
                          execute: (input: Parameters<Info['execute']>[0], context: Tool.Context) =>
                            executePromiseTool(value, input, context),
                        })
                      }),
                    remove: editor.remove,
                  }),
                ),
              ),
            hook: (name, callback) =>
              register(host.tool.hook(name, (event) => toolHook[name](() => Promise.resolve(callback(event))))),
          },
          session: {
            hook: (name, callback) =>
              register(host.session.hook(name, (event) => Effect.promise(() => Promise.resolve(callback(event))))),
            list: adaptMethod(SessionListSchemas, host.session.list),
            create: adaptMethod(SessionCreateSchemas, host.session.create),
            get: adaptMethod(SessionIdSchemas, host.session.get),
            remove: adaptMethod({}, host.session.remove),
            switchAgent: adaptMethod({}, host.session.switchAgent),
            switchModel: adaptMethod({}, host.session.switchModel),
            generate: undefined,
            command: undefined,
            compact: adaptMethod({}, host.session.compact),
            synthetic: undefined,
            interrupt: adaptMethod({}, host.session.interrupt),
            update: adaptMethod({}, host.session.update),
            wait: adaptMethod(SessionIdSchemas, host.session.wait),
            instructions: {
              entry: {
                list: adaptMethod({}, host.session.instructions.entry.list),
                put: adaptMethod({}, host.session.instructions.entry.put),
                remove: adaptMethod({}, host.session.instructions.entry.remove),
              },
            },
          },
          servers: host.servers,
          harness: host.harness,
          bundler: host.bundler,
        }

        yield* Effect.acquireRelease(
          Effect.promise(() => Promise.resolve(plugin.setup(context2))),
          (cleanup) => (typeof cleanup === 'function' ? Effect.promise(() => Promise.resolve(cleanup())) : Effect.void),
        )
      }),
  })
}

type RuntimeSchema = Schema.Codec<unknown, unknown>

const standardSchema = (schema: Tool.ValueSchema): PromiseTool.ValueSchema =>
  Schema.isSchema(schema) ? Schema.toStandardSchemaV1(schema) : schema

const promiseSchemas = (tool: Tool.Info) => ({
  input: standardSchema(tool.input),
  output: tool.output === undefined ? undefined : standardSchema(tool.output),
})

const toolError = (error: unknown) =>
  error instanceof globalThis.Error && Schema.is(Tool.Error)(error)
    ? error
    : Tool.makeError({message: error instanceof globalThis.Error ? error.message : String(error), error})

const toolHook: {
  readonly [Name in keyof ToolHooks]: (run: () => Promise<void>) => Effect.Effect<void, ToolFailures[Name]>
} = {
  'execute.before': (run) => Effect.tryPromise({try: run, catch: toolError}),
  'execute.after': (run) => Effect.promise(run),
}

const executePromiseTool = (tool: Info, input: any, context: Tool.Context) =>
  Effect.tryPromise({
    try: (interrupted) => {
      const stopped = new AbortController()
      const finished = new AbortController()
      const signal = AbortSignal.any([interrupted, stopped.signal])
      const {cancel, ...rest} = context
      let listening = false
      const listen = () => {
        if (listening || !cancel) return
        listening = true
        Effect.runPromise(cancel, {signal: AbortSignal.any([interrupted, finished.signal])}).then(
          () => stopped.abort(),
          () => {},
        )
      }
      return Promise.resolve(
        tool.execute(input, {
          ...rest,
          get signal() {
            listen()
            return signal
          },
          progress: (update) => Effect.runPromise(context.progress(update), {signal: interrupted}),
        }),
      ).finally(() => finished.abort())
    },
    catch: toolError,
  })
