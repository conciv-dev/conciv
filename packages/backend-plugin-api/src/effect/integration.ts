import type * as Connection from '@conciv/protocol/schema/connection'
import type * as Credential from '@conciv/protocol/schema/credential'
import type * as Form from '@conciv/protocol/schema/form'
import type * as Integration from '@conciv/protocol/schema/integration'
import type * as Location from '@conciv/protocol/schema/location'
import type {Effect, Scope} from 'effect'
import type {Transform} from './registration.js'

type IntegrationRef = {id: string; name: string}

type LocationInput = {readonly location?: {readonly directory?: string | undefined} | undefined}

type Located<Data> = {readonly location: Location.PublicRef; readonly data: Data}

type AttemptInput = LocationInput & {readonly integrationId: string; readonly attemptId: string}

export type ConnectionInfo = Connection.Info

export interface IntegrationOAuthMethod {
  readonly id: string
  readonly type: 'oauth'
  readonly label: string
  readonly form?: Form.Fields
}

export interface IntegrationCommandMethod {
  readonly id: string
  readonly type: 'command'
  readonly label: string
  readonly command: ReadonlyArray<string>
}

export interface IntegrationKeyMethod {
  readonly type: 'key'
  readonly label?: string
  readonly form?: Form.Fields
}

export interface IntegrationExternalMethod {
  readonly id: string
  readonly type: 'external'
  readonly label: string
  readonly form?: Form.Fields
}

export interface IntegrationEnvMethod {
  readonly type: 'env'
  readonly names: ReadonlyArray<string>
}

export type IntegrationMethod =
  | IntegrationOAuthMethod
  | IntegrationCommandMethod
  | IntegrationKeyMethod
  | IntegrationExternalMethod
  | IntegrationEnvMethod

export type IntegrationOAuthAuthorization = {
  readonly url: string
  readonly instructions: string
  readonly expiresAt?: number
} & (
  | {
      readonly mode: 'auto'
      readonly callback: Effect.Effect<Credential.OAuth, unknown>
      readonly submit?: (redirect: string) => Effect.Effect<void, unknown>
    }
  | {
      readonly mode: 'code'
      readonly callback: (code: string) => Effect.Effect<Credential.OAuth, unknown>
    }
)

export type IntegrationOAuthMethodRegistration = {
  readonly integrationId: string
  readonly method: IntegrationOAuthMethod
  readonly authorize: (answer: Form.Answer) => Effect.Effect<IntegrationOAuthAuthorization, unknown, Scope.Scope>
  readonly refresh?: (credential: Credential.OAuth) => Effect.Effect<Credential.OAuth, unknown>
  readonly label?: (credential: Credential.OAuth) => string | undefined
}

export type IntegrationMethodRegistration =
  | IntegrationOAuthMethodRegistration
  | {readonly integrationId: string; readonly method: IntegrationCommandMethod}
  | {readonly integrationId: string; readonly method: IntegrationKeyMethod}
  | {readonly integrationId: string; readonly method: IntegrationExternalMethod}
  | {readonly integrationId: string; readonly method: IntegrationEnvMethod}

export interface IntegrationEditor {
  list(): readonly IntegrationRef[]
  get(id: string): IntegrationRef | undefined
  update(id: string, update: (integration: IntegrationRef) => void): void
  remove(id: string): void
  readonly method: {
    list(integrationId: string): readonly IntegrationMethod[]
    update(input: IntegrationMethodRegistration): void
    remove(integrationId: string, method: IntegrationMethod): void
  }
}

export interface IntegrationApi {
  readonly list: (input?: LocationInput) => Effect.Effect<Located<ReadonlyArray<Integration.Info>>, unknown>
  readonly get: (
    input: LocationInput & {readonly integrationId: string},
  ) => Effect.Effect<Located<Integration.Info>, unknown>
  readonly connect: {
    readonly key: (
      input: LocationInput & {
        readonly integrationId: string
        readonly key: Credential.Key['key']
        readonly answer?: Form.Answer | undefined
        readonly label?: string | undefined
      },
    ) => Effect.Effect<void, unknown>
    readonly external: (
      input: LocationInput & {
        readonly integrationId: string
        readonly methodId: string
        readonly answer?: Form.Answer | undefined
        readonly label?: string | undefined
      },
    ) => Effect.Effect<void, unknown>
  }
  readonly oauth: {
    readonly connect: (
      input: LocationInput & {
        readonly integrationId: string
        readonly methodId: string
        readonly answer?: Form.Answer | undefined
        readonly label?: string | undefined
      },
    ) => Effect.Effect<Located<Integration.Attempt>, unknown>
    readonly status: (input: AttemptInput) => Effect.Effect<Located<Integration.AttemptStatus>, unknown>
    readonly complete: (input: AttemptInput & {readonly code?: string | undefined}) => Effect.Effect<void, unknown>
    readonly cancel: (input: AttemptInput) => Effect.Effect<void, unknown>
  }
  readonly command: {
    readonly connect: (
      input: LocationInput & {
        readonly integrationId: string
        readonly methodId: string
        readonly label?: string | undefined
      },
    ) => Effect.Effect<Located<Integration.CommandAttempt>, unknown>
    readonly status: (input: AttemptInput) => Effect.Effect<Located<Integration.CommandAttemptStatus>, unknown>
    readonly cancel: (input: AttemptInput) => Effect.Effect<void, unknown>
  }
}

export interface CredentialDomain {
  readonly activate: (input: {readonly credentialId: string}) => Effect.Effect<void, unknown>
}

export interface IntegrationDomain extends IntegrationApi {
  readonly transform: Transform<IntegrationEditor>
  readonly reload: () => Effect.Effect<void>
  readonly connection: {
    readonly active: (integrationId: string) => Effect.Effect<ConnectionInfo | undefined, unknown>
    readonly resolve: (connection: ConnectionInfo) => Effect.Effect<Credential.Value | undefined, unknown>
    readonly status: (input: {
      readonly integrationId: string
      readonly connection: ConnectionInfo
      readonly status: Connection.Status | undefined
    }) => Effect.Effect<void>
  }
}
