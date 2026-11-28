import {oc} from '@orpc/contract'
import {Schema as EffectSchema} from 'effect'
import {z} from 'zod'
import {engineContractErrors} from './errors.js'
import * as Credential from './schema/credential.js'
import * as Integration from './schema/integration.js'
import * as Location from './schema/location.js'

const Text = z.string()
const Secret = z.string()
const Label = z.string()

const FormAnswer = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))

const Metadata = z.record(z.string(), z.unknown())

export const CredentialValueInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('oauth'),
    methodId: Text,
    refresh: Secret,
    access: Secret,
    expires: z.number().int().nonnegative(),
    metadata: Metadata.optional(),
  }),
  z.object({type: z.literal('key'), key: Secret, metadata: Metadata.optional()}),
  z.object({type: z.literal('external'), methodId: Text, metadata: Metadata.optional()}),
])

export type CredentialValueInput = z.infer<typeof CredentialValueInput>

const located = <S extends EffectSchema.Codec<unknown, unknown>>(data: S) =>
  EffectSchema.toStandardSchemaV1(Location.response(data))

const CredentialIdInput = z.object({credentialId: Text})
const IntegrationIdInput = z.object({integrationId: Text})
const AttemptInput = IntegrationIdInput.extend({attemptId: Text})
const Ok = z.object({ok: z.literal(true)})

const stored = oc.errors(engineContractErrors('HOME_UNREACHABLE'))

export const credentialContract = {
  list: stored.output(EffectSchema.toStandardSchemaV1(EffectSchema.Array(Credential.RedactedEntry))),
  create: stored
    .errors(engineContractErrors('CONFLICT', 'INTEGRATION_POLICY'))
    .input(
      z.object({
        id: Text.optional(),
        integrationId: Text,
        label: Label.optional(),
        value: CredentialValueInput,
        activate: z.boolean().optional(),
      }),
    )
    .output(EffectSchema.toStandardSchemaV1(Credential.RedactedEntry)),
  update: stored.input(CredentialIdInput.extend({label: Label})).output(Ok),
  activate: stored.input(CredentialIdInput).output(Ok),
  remove: stored.input(CredentialIdInput).output(Ok),
}

const ConnectFields = {methodId: Text, answer: FormAnswer.optional(), label: Label.optional()}

export const integrationContract = {
  list: stored.output(located(EffectSchema.Array(Integration.Info))),
  get: stored
    .errors(engineContractErrors('INTEGRATION_NOT_FOUND'))
    .input(IntegrationIdInput)
    .output(located(Integration.Info)),
  connect: {
    key: stored
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_POLICY', 'INTEGRATION_AUTHORIZATION'))
      .input(IntegrationIdInput.extend({key: Secret, answer: FormAnswer.optional(), label: Label.optional()}))
      .output(Ok),
    external: stored
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_POLICY', 'INTEGRATION_AUTHORIZATION'))
      .input(IntegrationIdInput.extend(ConnectFields))
      .output(Ok),
  },
  oauth: {
    connect: stored
      .errors(engineContractErrors('INTEGRATION_POLICY', 'INTEGRATION_AUTHORIZATION'))
      .input(IntegrationIdInput.extend(ConnectFields))
      .output(located(Integration.Attempt)),
    status: stored
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_ATTEMPT_NOT_FOUND'))
      .input(AttemptInput)
      .output(located(Integration.AttemptStatus)),
    complete: stored
      .errors(
        engineContractErrors(
          'INTEGRATION_NOT_FOUND',
          'INTEGRATION_ATTEMPT_NOT_FOUND',
          'INTEGRATION_CODE_REQUIRED',
          'INTEGRATION_AUTHORIZATION',
        ),
      )
      .input(AttemptInput.extend({code: z.string().optional()}))
      .output(Ok),
    cancel: stored.input(AttemptInput).output(Ok),
  },
  command: {
    connect: stored
      .errors(
        engineContractErrors(
          'INTEGRATION_NOT_FOUND',
          'INTEGRATION_METHOD_NOT_FOUND',
          'INTEGRATION_POLICY',
          'INTEGRATION_AUTHORIZATION',
        ),
      )
      .input(IntegrationIdInput.extend({methodId: Text, label: Label.optional()}))
      .output(located(Integration.CommandAttempt)),
    status: stored
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_ATTEMPT_NOT_FOUND'))
      .input(AttemptInput)
      .output(located(Integration.CommandAttemptStatus)),
    cancel: stored.input(AttemptInput).output(Ok),
  },
}
