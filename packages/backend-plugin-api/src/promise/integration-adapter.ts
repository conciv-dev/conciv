import {Effect} from 'effect'
import type {Scope} from 'effect'
import type {Context as EffectContext, IntegrationMethodRegistration as EffectRegistration} from '../effect/plugin.js'
import type {CredentialDomain, IntegrationDomain, IntegrationMethodRegistration} from './integration.js'

type HostRegistration = {readonly dispose: Effect.Effect<void>}
type Registration = {readonly dispose: () => Promise<void>}

export interface IntegrationAdapterDeps {
  readonly host: EffectContext
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>
  readonly register: (effect: Effect.Effect<HostRegistration, never, Scope.Scope>) => Promise<Registration>
}

export function adaptIntegration({host, run, register}: IntegrationAdapterDeps): {
  readonly credential: CredentialDomain
  readonly integration: IntegrationDomain
} {
  const integration = host.integration
  return {
    credential: {
      activate: (input) => run(host.credential.activate(input)),
    },
    integration: {
      list: () => run(integration.list()),
      get: (input) => run(integration.get(input)),
      connect: {
        key: (input) => run(integration.connect.key(input)),
        external: (input) => run(integration.connect.external(input)),
      },
      oauth: {
        connect: (input) => run(integration.oauth.connect(input)),
        status: (input) => run(integration.oauth.status(input)),
        complete: (input) => run(integration.oauth.complete(input)),
        cancel: (input) => run(integration.oauth.cancel(input)),
      },
      command: {
        connect: (input) => run(integration.command.connect(input)),
        status: (input) => run(integration.command.status(input)),
        cancel: (input) => run(integration.command.cancel(input)),
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

function effectRegistration(input: IntegrationMethodRegistration): EffectRegistration {
  if (!('authorize' in input)) return input
  const refresh = input.refresh
  return {
    ...input,
    authorize: (answer) =>
      Effect.promise(() => input.authorize(answer)).pipe(
        Effect.map((authorization) => {
          if (authorization.mode === 'code')
            return {
              ...authorization,
              callback: (code: string) => Effect.promise(() => authorization.callback(code)),
            }
          const submit = authorization.submit
          return {
            ...authorization,
            callback: Effect.promise(() => authorization.callback),
            submit: submit
              ? (redirect: string) => Effect.tryPromise({try: () => submit(redirect), catch: (error) => error})
              : undefined,
          }
        }),
      ),
    refresh: refresh === undefined ? undefined : (credential) => Effect.promise(() => refresh(credential)),
  }
}
