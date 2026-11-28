import {Effect, Schema} from 'effect'
import type {Scope} from 'effect'
import * as Credential from '@conciv/protocol/schema/credential'
import * as Form from '@conciv/protocol/schema/form'
import * as Integration from '@conciv/protocol/schema/integration'
import * as Location from '@conciv/protocol/schema/location'
import type {Context as EffectContext, IntegrationMethodRegistration as EffectRegistration} from '../effect/plugin.js'
import type {CredentialDomain, IntegrationDomain, IntegrationMethodRegistration} from './integration.js'

export const LocationQuery = Schema.Struct({
  location: Schema.optional(
    Schema.Struct({
      directory: Schema.optional(Schema.String),
    }),
  ),
}).annotate({identifier: 'LocationQuery'})

type HostRegistration = {readonly dispose: Effect.Effect<void>}
type Registration = {readonly dispose: () => Promise<void>}
type RuntimeSchema = Schema.Codec<unknown, unknown>
type MethodSchemas = {readonly input?: RuntimeSchema; readonly output?: RuntimeSchema}

export interface IntegrationAdapterDeps {
  readonly host: EffectContext
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>
  readonly register: (effect: Effect.Effect<HostRegistration, never, Scope.Scope>) => Promise<Registration>
  readonly adaptMethod: <PromiseMethod>(
    schemas: MethodSchemas,
    method: (input: never) => Effect.Effect<unknown, unknown>,
  ) => PromiseMethod
}

export function adaptIntegration({host, run, register, adaptMethod}: IntegrationAdapterDeps): {
  readonly credential: CredentialDomain
  readonly integration: IntegrationDomain
} {
  const integration = host.integration
  const input = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
    Schema.Struct({...LocationQuery.fields, ...fields})
  const integrationId = {integrationId: Schema.String}
  const attempt = {...integrationId, attemptId: Schema.String}
  const connect = {
    ...integrationId,
    methodId: Schema.String,
    answer: Schema.optional(Form.Answer),
    label: Schema.optional(Schema.String),
  }
  return {
    credential: {
      activate: adaptMethod({input: Schema.Struct({credentialId: Credential.Id})}, host.credential.activate),
    },
    integration: {
      list: adaptMethod(
        {input: input({}), output: Location.response(Schema.Array(Integration.Info))},
        integration.list,
      ),
      get: adaptMethod({input: input(integrationId), output: Location.response(Integration.Info)}, integration.get),
      connect: {
        key: adaptMethod(
          {
            input: input({
              ...integrationId,
              key: Schema.RedactedFromValue(Schema.String),
              answer: Schema.optional(Form.Answer),
              label: Schema.optional(Schema.String),
            }),
          },
          integration.connect.key,
        ),
        external: adaptMethod({input: input(connect)}, integration.connect.external),
      },
      oauth: {
        connect: adaptMethod(
          {input: input(connect), output: Location.response(Integration.Attempt)},
          integration.oauth.connect,
        ),
        status: adaptMethod(
          {input: input(attempt), output: Location.response(Integration.AttemptStatus)},
          integration.oauth.status,
        ),
        complete: adaptMethod(
          {input: input({...attempt, code: Schema.optional(Schema.String)})},
          integration.oauth.complete,
        ),
        cancel: adaptMethod({input: input(attempt)}, integration.oauth.cancel),
      },
      command: {
        connect: adaptMethod(
          {
            input: input({...integrationId, methodId: Schema.String, label: Schema.optional(Schema.String)}),
            output: Location.response(Integration.CommandAttempt),
          },
          integration.command.connect,
        ),
        status: adaptMethod(
          {input: input(attempt), output: Location.response(Integration.CommandAttemptStatus)},
          integration.command.status,
        ),
        cancel: adaptMethod({input: input(attempt)}, integration.command.cancel),
      },
      transform: (callback) =>
        register(
          integration.transform((editor) =>
            callback({
              list: editor.list,
              get: editor.get,
              update: editor.update,
              remove: editor.remove,
              method: {
                list: editor.method.list,
                update: (input) => editor.method.update(effectRegistration(input)),
                remove: editor.method.remove,
              },
            }),
          ),
        ),
      reload: () => run(integration.reload()),
      connection: {
        active: (id) => run(integration.connection.active(id)),
        resolve: (connection) => run(integration.connection.resolve(connection)),
        status: (input) => run(integration.connection.status(input)),
      },
    },
  }
}

const attempt = <A>(run: () => Promise<A>) => Effect.tryPromise({try: run, catch: (error) => error})

function effectRegistration(input: IntegrationMethodRegistration): EffectRegistration {
  if (!('authorize' in input)) return input
  const refresh = input.refresh
  return {
    ...input,
    authorize: (answer) =>
      attempt(() => input.authorize(answer)).pipe(
        Effect.map((authorization) => {
          if (authorization.mode === 'code')
            return {
              ...authorization,
              callback: (code: string) => attempt(() => authorization.callback(code)),
            }
          const submit = authorization.submit
          return {
            ...authorization,
            callback: attempt(() => authorization.callback),
            submit: submit ? (redirect: string) => attempt(() => submit(redirect)) : undefined,
          }
        }),
      ),
    refresh: refresh === undefined ? undefined : (credential) => attempt(() => refresh(credential)),
  }
}
