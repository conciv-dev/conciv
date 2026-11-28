import {Schema} from 'effect'
import * as Credential from './credential.js'
import {optional} from './schema.js'

export interface Status extends Schema.Schema.Type<typeof Status> {}
export const Status = Schema.Struct({
  status: Schema.Literals(['needs_auth']),
  message: Schema.String,
  url: optional(Schema.String),
}).annotate({identifier: 'Connection.Status'})

export interface CredentialInfo extends Schema.Schema.Type<typeof CredentialInfo> {}
export const CredentialInfo = Schema.Struct({
  type: Schema.Literal('credential'),
  id: Credential.Id,
  label: Schema.String,
  method: Schema.Literals(['key', 'oauth', 'external']),
  status: optional(Status),
}).annotate({identifier: 'Connection.CredentialInfo'})

export interface EnvInfo extends Schema.Schema.Type<typeof EnvInfo> {}
export const EnvInfo = Schema.Struct({
  type: Schema.Literal('env'),
  name: Schema.String,
  status: optional(Status),
}).annotate({identifier: 'Connection.EnvInfo'})

export const Info = Schema.Union([CredentialInfo, EnvInfo])
  .pipe(Schema.toTaggedUnion('type'))
  .annotate({identifier: 'Connection.Info'})
export type Info = typeof Info.Type
