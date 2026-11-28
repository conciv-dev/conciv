import {Schema} from 'effect'

export const IntegrationId = Schema.String.pipe(
  Schema.brand('Integration.ID'),
  Schema.annotate({identifier: 'Integration.ID'}),
)
export type IntegrationId = typeof IntegrationId.Type

export const IntegrationMethodId = Schema.String.pipe(
  Schema.brand('Integration.MethodID'),
  Schema.annotate({identifier: 'Integration.MethodID'}),
)
export type IntegrationMethodId = typeof IntegrationMethodId.Type
