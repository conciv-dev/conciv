import type {Effect, Scope, Types} from 'effect'
import type * as IntegrationSchema from '@conciv/protocol/schema/integration'
import type * as Credential from '../credential.js'
import * as Form from '../form.js'

type Id = IntegrationSchema.Id

export type OAuthAuthorization = {
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

export interface OAuthImplementation {
  readonly integrationId: Id
  readonly method: IntegrationSchema.OAuthMethod
  readonly authorize: (answer: Form.Answer) => Effect.Effect<OAuthAuthorization, unknown, Scope.Scope>
  readonly refresh?: (credential: Credential.OAuth) => Effect.Effect<Credential.OAuth, unknown>
  readonly label?: (credential: Credential.OAuth) => string | undefined
}

export interface KeyImplementation {
  readonly integrationId: Id
  readonly method: IntegrationSchema.KeyMethod
}

export interface ExternalImplementation {
  readonly integrationId: Id
  readonly method: IntegrationSchema.ExternalMethod
}

export interface CommandImplementation {
  readonly integrationId: Id
  readonly method: IntegrationSchema.CommandMethod
}

export interface EnvImplementation {
  readonly integrationId: Id
  readonly method: IntegrationSchema.EnvMethod
}

export type Implementation =
  | OAuthImplementation
  | CommandImplementation
  | KeyImplementation
  | ExternalImplementation
  | EnvImplementation

export type Editor = {
  list: () => readonly Types.DeepMutable<IntegrationSchema.Ref>[]
  get: (id: Id) => Types.DeepMutable<IntegrationSchema.Ref> | undefined
  update: (id: Id, update: (integration: Types.DeepMutable<IntegrationSchema.Ref>) => void) => void
  remove: (id: Id) => void
  method: {
    list: (integrationId: Id) => readonly IntegrationSchema.Method[]
    update: (implementation: Implementation) => void
    remove: (integrationId: Id, method: IntegrationSchema.Method) => void
  }
}

export type AnswerCheck = (
  form: ReadonlyArray<Form.Field> | undefined,
  answer: Form.Answer,
  method?: string,
) => string | undefined

export const sameMethod = (a: IntegrationSchema.Method, b: IntegrationSchema.Method) =>
  a.type === b.type && (!('id' in a) || !('id' in b) || a.id === b.id)

export const answerError: AnswerCheck = (form, answer, method) => {
  if (form) return Form.validateFields(form) ?? Form.validateAnswer(form, answer)
  if (method && Object.keys(answer).length > 0) return `${method} method does not accept a form answer`
  return undefined
}
