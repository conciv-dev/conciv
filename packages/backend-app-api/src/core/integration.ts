import {Clock, Config, ConfigProvider, Context, Effect, Equal, Layer, Option, Redacted, Scope, Types} from 'effect'
import {ChildProcessSpawner} from 'effect/process/ChildProcessSpawner'
import * as IntegrationSchema from '@conciv/protocol/schema/integration'
import * as Identifier from '@conciv/protocol/schema/identifier'
import type {EvlogError} from 'evlog'
import * as Credential from './credential.js'
import * as State from './state.js'
import * as Bus from './bus.js'
import * as IntegrationConnection from './integration/connection.js'
import type * as Form from './form.js'
import {answerRefused, authorize, makeAttempts} from './integration/attempts.js'
import {answerError, sameMethod, type Editor, type OAuthImplementation} from './integration/implementation.js'

export type {
  CommandImplementation,
  Editor,
  EnvImplementation,
  ExternalImplementation,
  Implementation,
  KeyImplementation,
  OAuthAuthorization,
  OAuthImplementation,
} from './integration/implementation.js'

export const Id = IntegrationSchema.Id
export type Id = IntegrationSchema.Id

export const MethodId = IntegrationSchema.MethodId
export type MethodId = IntegrationSchema.MethodId

export const AttemptId = IntegrationSchema.AttemptId
export type AttemptId = typeof AttemptId.Type

export const OAuthMethod = IntegrationSchema.OAuthMethod
export type OAuthMethod = IntegrationSchema.OAuthMethod

export const CommandMethod = IntegrationSchema.CommandMethod
export type CommandMethod = IntegrationSchema.CommandMethod

export const KeyMethod = IntegrationSchema.KeyMethod
export type KeyMethod = IntegrationSchema.KeyMethod

export const ExternalMethod = IntegrationSchema.ExternalMethod
export type ExternalMethod = IntegrationSchema.ExternalMethod

export const EnvMethod = IntegrationSchema.EnvMethod
export type EnvMethod = IntegrationSchema.EnvMethod

export const Method = IntegrationSchema.Method
export type Method = IntegrationSchema.Method

export const Info = IntegrationSchema.Info
export type Info = IntegrationSchema.Info

export const Attempt = IntegrationSchema.Attempt
export type Attempt = IntegrationSchema.Attempt

export const AttemptStatus = IntegrationSchema.AttemptStatus
export type AttemptStatus = typeof AttemptStatus.Type

export const CommandAttempt = IntegrationSchema.CommandAttempt
export type CommandAttempt = IntegrationSchema.CommandAttempt

export const CommandAttemptStatus = IntegrationSchema.CommandAttemptStatus
export type CommandAttemptStatus = IntegrationSchema.CommandAttemptStatus

export const Event = IntegrationSchema.Event

export const Ref = IntegrationSchema.Ref
export type Ref = IntegrationSchema.Ref

type Entry = {
  ref: Types.DeepMutable<Ref>
  methods: Method[]
  implementations: Map<MethodId, OAuthImplementation>
}

type Data = {
  integrations: Map<Id, Entry>
}

type AttemptInput = {readonly integrationId: Id; readonly attemptId: AttemptId}

export interface Interface extends State.Transformable<Editor> {
  readonly revision: () => number
  readonly get: (id: Id) => Effect.Effect<Info | undefined, EvlogError>
  readonly list: () => Effect.Effect<Info[], EvlogError>
  readonly connection: {
    readonly active: (id: Id) => Effect.Effect<IntegrationConnection.Info | undefined, EvlogError>
    readonly resolve: (
      connection: IntegrationConnection.Info,
    ) => Effect.Effect<Credential.Value | undefined, EvlogError>
    readonly key: (input: {
      readonly integrationId: Id
      readonly key: Credential.Key['key']
      readonly answer?: Form.Answer
      readonly label?: string
    }) => Effect.Effect<void, EvlogError>
    readonly external: (input: {
      readonly integrationId: Id
      readonly methodId: MethodId
      readonly answer?: Form.Answer
      readonly label?: string
    }) => Effect.Effect<void, EvlogError>
    readonly activate: (credentialId: Credential.Id) => Effect.Effect<void, EvlogError>
    readonly update: (
      credentialId: Credential.Id,
      updates: Partial<Pick<Credential.Info, 'label'>>,
    ) => Effect.Effect<void, EvlogError>
    readonly remove: (credentialId: Credential.Id) => Effect.Effect<void, EvlogError>
    readonly status: (input: {
      readonly integrationId: Id
      readonly connection: IntegrationConnection.Info
      readonly status: IntegrationConnection.Status | undefined
    }) => Effect.Effect<void>
  }
  readonly oauth: {
    readonly connect: (input: {
      readonly integrationId: Id
      readonly methodId: MethodId
      readonly answer?: Form.Answer
      readonly label?: string
    }) => Effect.Effect<Attempt, EvlogError>
    readonly status: (input: AttemptInput) => Effect.Effect<AttemptStatus, EvlogError>
    readonly complete: (input: AttemptInput & {readonly code?: string}) => Effect.Effect<void, EvlogError>
    readonly cancel: (input: AttemptInput) => Effect.Effect<void>
  }
  readonly command: {
    readonly connect: (input: {
      readonly integrationId: Id
      readonly methodId: MethodId
      readonly label?: string
    }) => Effect.Effect<CommandAttempt, EvlogError>
    readonly status: (input: AttemptInput) => Effect.Effect<CommandAttemptStatus, EvlogError>
    readonly cancel: (input: AttemptInput) => Effect.Effect<void>
  }
}

export const Service = Context.Service<Interface>('@conciv/Integration')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const credentials = yield* Credential.Service
    const bus = yield* Bus.Service
    const ids = yield* Identifier.Service
    const spawner = yield* ChildProcessSpawner
    const env = yield* ConfigProvider.ConfigProvider
    const scope = yield* Scope.Scope
    const statuses = new Map<string, IntegrationConnection.Status>()
    const statusKey = (integrationId: Id, connection: IntegrationConnection.Info) =>
      `${integrationId}:${IntegrationConnection.key(connection)}`
    const readEnv = (name: string) => Effect.runSync(Config.option(Config.Redacted(name)).parse(env).pipe(Effect.orDie))
    const state = State.create<Data, Editor>({
      name: 'integration',
      initial: () => ({integrations: new Map<Id, Entry>()}),
      editor: (editor) => {
        const ensure = (id: Id): Entry => {
          const current = editor.integrations.get(id) ?? {
            ref: {id, name: id},
            methods: [],
            implementations: new Map(),
          }
          if (!editor.integrations.has(id)) editor.integrations.set(id, current)
          return current
        }
        return {
          list: () => Array.from(editor.integrations.values(), (entry) => entry.ref),
          get: (id) => editor.integrations.get(id)?.ref,
          update: (id, update) => {
            const current = ensure(id)
            update(current.ref)
            current.ref.id = id
          },
          remove: (id) => {
            editor.integrations.delete(id)
          },
          method: {
            list: (integrationId) => editor.integrations.get(integrationId)?.methods ?? [],
            update: (implementation) => {
              const current = ensure(implementation.integrationId)
              const index = current.methods.findIndex((method) => sameMethod(method, implementation.method))
              if (index === -1) current.methods.push(implementation.method)
              else current.methods[index] = implementation.method
              if ('authorize' in implementation) {
                current.implementations.set(implementation.method.id, implementation)
              }
            },
            remove: (integrationId, method) => {
              const current = editor.integrations.get(integrationId)
              if (!current) return
              const index = current.methods.findIndex((candidate) => sameMethod(candidate, method))
              if (index !== -1) current.methods.splice(index, 1)
              if (method.type === 'oauth') current.implementations.delete(method.id)
            },
          },
        }
      },
      notify: State.changes(
        (data) =>
          Array.from(data.integrations.values(), (entry) => project(entry, resolveConnections(entry, []))).toSorted(
            (a, b) => a.name.localeCompare(b.name),
          ),
        () => bus.publish(IntegrationSchema.Event.Updated, {}).pipe(Effect.asVoid),
      ),
    })

    const sorted = new WeakMap<Map<Id, Entry>, Entry[]>()
    const sortedEntries = () => {
      const integrations = state.get().integrations
      const cached = sorted.get(integrations)
      if (cached) return cached
      const entries = Array.from(integrations.values()).toSorted((a, b) => a.ref.name.localeCompare(b.ref.name))
      sorted.set(integrations, entries)
      return entries
    }

    const createCredential = Effect.fnUntraced(function* (input: Parameters<Credential.Interface['create']>[0]) {
      if (input.label !== undefined) return yield* credentials.create(input)
      const name = state.get().integrations.get(input.integrationId)?.ref.name ?? input.integrationId
      const labels = new Set((yield* credentials.list(input.integrationId)).map((credential) => credential.label))
      const label =
        Array.from({length: labels.size + 1}, (_, index) => (index === 0 ? name : `${name} ${index + 1}`)).find(
          (candidate) => !labels.has(candidate),
        ) ?? name
      return yield* credentials.create({...input, label})
    })

    const credentialConnections = (saved: readonly Credential.Info[]): IntegrationConnection.Info[] =>
      saved
        .map((credential) => ({
          type: 'credential' as const,
          id: credential.id,
          label: credential.label,
          method: credential.value.type,
        }))
        .toReversed()

    const resolveConnections = (entry: Entry | undefined, saved: readonly Credential.Info[]) => {
      const envConnections = (entry?.methods ?? [])
        .flatMap((method) => (method.type === 'env' ? method.names : []))
        .filter((name) => {
          const value = readEnv(name)
          return Option.isSome(value) && Redacted.value(value.value).length > 0
        })
        .map((name) => ({type: 'env' as const, name}))
      return [...credentialConnections(saved), ...envConnections]
    }

    const project = (entry: Entry, connections: IntegrationConnection.Info[]): Info =>
      Info.make({
        id: entry.ref.id,
        name: entry.ref.name,
        ...(entry.ref.metadata === undefined ? {} : {metadata: entry.ref.metadata}),
        methods: entry.methods,
        connections: connections.map((connection) => {
          const status = statuses.get(statusKey(entry.ref.id, connection))
          return status ? {...connection, status} : connection
        }),
      })

    const lookup = (integrationId: Id) => state.get().integrations.get(integrationId)

    const {oauth, command} = yield* makeAttempts({
      scope,
      ids,
      spawner,
      createCredential,
      answerError,
      oauthMethod: (integrationId, methodId) => lookup(integrationId)?.implementations.get(methodId),
      commandMethod: (integrationId, methodId) =>
        lookup(integrationId)?.methods.find(
          (method): method is CommandMethod => method.type === 'command' && method.id === methodId,
        ),
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      revision: state.revision,
      get: Effect.fn('Integration.get')(function* (id) {
        const entry = lookup(id)
        if (!entry) return undefined
        return project(entry, resolveConnections(entry, yield* credentials.list(id)))
      }),
      list: Effect.fn('Integration.list')(function* () {
        const saved = Map.groupBy(yield* credentials.all(), (credential) => credential.integrationId)
        return sortedEntries().map((entry) => project(entry, resolveConnections(entry, saved.get(entry.ref.id) ?? [])))
      }),
      connection: {
        active: Effect.fn('Integration.connection.active')(function* (id) {
          const entry = lookup(id)
          return resolveConnections(entry, yield* credentials.list(id))[0]
        }),
        resolve: Effect.fn('Integration.connection.resolve')(function* (connection) {
          if (connection.type === 'env') {
            const key = readEnv(connection.name)
            return Option.isSome(key) && Redacted.value(key.value).length > 0
              ? Credential.Key.make({type: 'key', key: key.value})
              : undefined
          }
          const credential = yield* credentials.get(connection.id)
          if (!credential) return undefined
          if (credential.value.type !== 'oauth') return credential.value
          const refresh = lookup(credential.integrationId)?.implementations.get(credential.value.methodId)?.refresh
          if (!refresh || !Credential.expiring(credential.value, yield* Clock.currentTimeMillis))
            return credential.value
          return yield* authorize(credentials.refresh(credential.id, {stale: Credential.expiring, refresh}))
        }),
        key: Effect.fn('Integration.connection.key')(function* (input) {
          const method = lookup(input.integrationId)?.methods.find((candidate) => candidate.type === 'key')
          if (!method || method.type !== 'key')
            return yield* Effect.die(new Error(`Key method not found: ${input.integrationId}`))
          const answer = input.answer ?? {}
          const invalid = answerError(method.form, answer, 'Key')
          if (invalid) return yield* Effect.fail(answerRefused(invalid))
          yield* createCredential({
            integrationId: input.integrationId,
            label: input.label,
            value: Credential.Key.make({
              type: 'key',
              key: input.key,
              ...(Object.keys(answer).length > 0 ? {metadata: answer} : {}),
            }),
          })
        }),
        external: Effect.fn('Integration.connection.external')(function* (input) {
          const method = lookup(input.integrationId)?.methods.find(
            (candidate) => candidate.type === 'external' && candidate.id === input.methodId,
          )
          if (method?.type !== 'external')
            return yield* Effect.fail(answerRefused(`External method not found: ${input.methodId}`))
          const answer = input.answer ?? {}
          const invalid = answerError(method.form, answer, 'External')
          if (invalid) return yield* Effect.fail(answerRefused(invalid))
          yield* createCredential({
            integrationId: input.integrationId,
            label: input.label,
            value: Credential.External.make({
              type: 'external',
              methodId: method.id,
              ...(Object.keys(answer).length > 0 ? {metadata: answer} : {}),
            }),
          })
        }),
        activate: Effect.fn('Integration.connection.activate')((credentialId) => credentials.activate(credentialId)),
        update: Effect.fn('Integration.connection.update')((credentialId, updates) =>
          credentials.update(credentialId, updates),
        ),
        remove: Effect.fn('Integration.connection.remove')((credentialId) => credentials.remove(credentialId)),
        status: Effect.fn('Integration.connection.status')(function* (input) {
          const key = statusKey(input.integrationId, input.connection)
          if (Equal.equals(statuses.get(key), input.status)) return
          if (input.status) statuses.set(key, input.status)
          if (!input.status) statuses.delete(key)
          yield* bus.publish(IntegrationSchema.Event.Updated, {})
        }),
      },
      oauth,
      command,
    })
  }),
)
