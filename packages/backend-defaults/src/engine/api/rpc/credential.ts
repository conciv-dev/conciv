import type {ContractedRouter} from '@orpc/server'
import {Effect, Redacted} from 'effect'
import type {contract, CredentialValueInput} from '@conciv/protocol'
import {engineErrors} from '@conciv/errors'
import {Credential, Integration} from '@conciv/backend-app-api'
import type * as CredentialSchema from '@conciv/protocol/schema/credential'
import {os, type EngineRpcContext} from './mount.js'
import {requireConnectable} from './integration.js'

const ok = {ok: true as const}

const placeholder = '<redacted>' as const

function redacted(value: Credential.Value): CredentialSchema.RedactedValue {
  if (value.type === 'key') return {...value, key: placeholder}
  if (value.type === 'oauth') return {...value, access: placeholder, refresh: placeholder}
  return value
}

function entries(credentials: Credential.Info[]): CredentialSchema.RedactedEntry[] {
  const selected = new Map(credentials.map((item) => [item.integrationId, item.id]))
  return credentials.map((item) => ({
    id: item.id,
    integrationId: item.integrationId,
    label: item.label,
    active: selected.get(item.integrationId) === item.id,
    value: redacted(item.value),
  }))
}

function redactedValue(value: CredentialValueInput): Credential.Value {
  if (value.type === 'key') return Credential.Key.make({...value, key: Redacted.make(value.key)})
  if (value.type === 'oauth')
    return Credential.OAuth.make({
      ...value,
      methodId: Integration.MethodId.make(value.methodId),
      refresh: Redacted.make(value.refresh),
      access: Redacted.make(value.access),
    })
  return Credential.External.make({...value, methodId: Integration.MethodId.make(value.methodId)})
}

export function credentialRouter(): ContractedRouter<typeof contract.credential, EngineRpcContext> {
  return {
    list: os.credential.list.effect(function* () {
      return entries(yield* Credential.Service.use((credential) => credential.all()))
    }),
    create: os.credential.create.effect(function* ({input}) {
      const integrationId = Integration.Id.make(input.integrationId)
      yield* requireConnectable(integrationId)
      const credential = yield* Credential.Service
      const id = input.id === undefined ? undefined : Credential.Id.make(input.id)
      if (id && (yield* credential.get(id)))
        return yield* Effect.fail(engineErrors.CONFLICT({message: `Credential already exists: ${id}`}))
      const created = yield* credential.create({
        id,
        integrationId,
        label: input.label,
        value: redactedValue(input.value),
        activate: input.activate,
      })
      const entry = entries(yield* credential.list(created.integrationId)).find((item) => item.id === created.id)
      return entry ?? {...created, active: false, value: redacted(created.value)}
    }),
    update: os.credential.update.effect(function* ({input}) {
      yield* Credential.Service.use((credential) =>
        credential.update(Credential.Id.make(input.credentialId), {label: input.label}),
      )
      return ok
    }),
    activate: os.credential.activate.effect(function* ({input}) {
      yield* Credential.Service.use((credential) => credential.activate(Credential.Id.make(input.credentialId)))
      return ok
    }),
    remove: os.credential.remove.effect(function* ({input}) {
      yield* Credential.Service.use((credential) => credential.remove(Credential.Id.make(input.credentialId)))
      return ok
    }),
  }
}
