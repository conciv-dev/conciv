import * as Connection from '@conciv/protocol/schema/connection'

export const CredentialInfo = Connection.CredentialInfo
export type CredentialInfo = Connection.CredentialInfo

export const EnvInfo = Connection.EnvInfo
export type EnvInfo = Connection.EnvInfo

export const Info = Connection.Info
export type Info = Connection.Info

export const Status = Connection.Status
export type Status = Connection.Status

export function key(
  connection:
    | {readonly type: 'credential'; readonly id: string}
    | {readonly type: 'env'; readonly name: string}
    | undefined,
) {
  if (!connection) return undefined
  return connection.type === 'credential' ? `credential:${connection.id}` : `env:${connection.name}`
}
