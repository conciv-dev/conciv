import type {RpcCallOptions} from '@conciv/client'
import type * as Connection from '@conciv/protocol/schema/connection'
import type * as Credential from '@conciv/protocol/schema/credential'
import type * as Form from '@conciv/protocol/schema/form'
import type * as Integration from '@conciv/protocol/schema/integration'
import type {PublicRef} from '@conciv/protocol/schema/location'
import type {Transform} from './registration.js'

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

type IntegrationRef = {id: string; name: string}

type Located<Data> = Promise<{location: PublicRef; data: Data}>

type AttemptInput = {readonly integrationId: string; readonly attemptId: string}

export type ConnectionInfo = Connection.Info

export type IntegrationOAuthAuthorization = {
  readonly url: string
  readonly instructions: string
  readonly expiresAt?: number
} & (
  | {
      readonly mode: 'auto'
      readonly callback: Promise<Credential.OAuth>
      readonly submit?: (redirect: string) => Promise<void>
    }
  | {
      readonly mode: 'code'
      readonly callback: (code: string) => Promise<Credential.OAuth>
    }
)

export type IntegrationOAuthMethodRegistration = {
  readonly integrationId: string
  readonly method: IntegrationOAuthMethod
  readonly authorize: (answer: Form.Answer) => Promise<IntegrationOAuthAuthorization>
  readonly refresh?: (credential: Credential.OAuth) => Promise<Credential.OAuth>
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
  readonly list: (requestOptions?: RpcCallOptions) => Located<ReadonlyArray<Integration.Info>>
  readonly get: (input: {readonly integrationId: string}, requestOptions?: RpcCallOptions) => Located<Integration.Info>
  readonly connect: {
    readonly key: (
      input: {
        readonly integrationId: string
        readonly key: Credential.Key['key']
        readonly answer?: Form.Answer
        readonly label?: string
      },
      requestOptions?: RpcCallOptions,
    ) => Promise<void>
    readonly external: (
      input: {
        readonly integrationId: string
        readonly methodId: string
        readonly answer?: Form.Answer
        readonly label?: string
      },
      requestOptions?: RpcCallOptions,
    ) => Promise<void>
  }
  readonly oauth: {
    readonly connect: (
      input: {
        readonly integrationId: string
        readonly methodId: string
        readonly answer?: Form.Answer
        readonly label?: string
      },
      requestOptions?: RpcCallOptions,
    ) => Located<Integration.Attempt>
    readonly status: (input: AttemptInput, requestOptions?: RpcCallOptions) => Located<Integration.AttemptStatus>
    readonly complete: (
      input: AttemptInput & {readonly code?: string},
      requestOptions?: RpcCallOptions,
    ) => Promise<void>
    readonly cancel: (input: AttemptInput, requestOptions?: RpcCallOptions) => Promise<void>
  }
  readonly command: {
    readonly connect: (
      input: {readonly integrationId: string; readonly methodId: string; readonly label?: string},
      requestOptions?: RpcCallOptions,
    ) => Located<Integration.CommandAttempt>
    readonly status: (input: AttemptInput, requestOptions?: RpcCallOptions) => Located<Integration.CommandAttemptStatus>
    readonly cancel: (input: AttemptInput, requestOptions?: RpcCallOptions) => Promise<void>
  }
}

export interface CredentialDomain {
  readonly activate: (input: {readonly credentialId: string}, requestOptions?: RpcCallOptions) => Promise<void>
}

export interface IntegrationDomain extends IntegrationApi {
  readonly transform: Transform<IntegrationEditor>
  readonly reload: () => Promise<void>
  readonly connection: {
    readonly active: (integrationId: string) => Promise<ConnectionInfo | undefined>
    readonly resolve: (connection: ConnectionInfo) => Promise<Credential.Value | undefined>
    readonly status: (input: {
      readonly integrationId: string
      readonly connection: ConnectionInfo
      readonly status: Connection.Status | undefined
    }) => Promise<void>
  }
}
