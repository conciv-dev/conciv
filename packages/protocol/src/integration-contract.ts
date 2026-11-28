import {oc} from '@orpc/contract'
import {Schema as EffectSchema} from 'effect'
import {z} from 'zod'
import {engineContractErrors} from './errors.js'
import * as Credential from './schema/credential.js'
import * as Integration from './schema/integration.js'
import * as Location from './schema/location.js'

const Text = z.string().min(1).max(512)
const Secret = z.string().min(1).max(16_384)
const Label = z.string().max(512)

const FormAnswer = z.record(
  z.string().max(512),
  z.union([z.string().max(16_384), z.number(), z.boolean(), z.array(z.string().max(16_384)).max(256)]),
)

const Metadata = z.record(z.string().max(512), z.unknown())

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

export const credentialContract = {
  list: oc.output(EffectSchema.toStandardSchemaV1(EffectSchema.Array(Credential.Entry))),
  create: oc
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
    .output(EffectSchema.toStandardSchemaV1(Credential.Entry)),
  update: oc.input(CredentialIdInput.extend({label: Label})).output(Ok),
  activate: oc.input(CredentialIdInput).output(Ok),
  remove: oc.input(CredentialIdInput).output(Ok),
}

const ConnectFields = {methodId: Text, answer: FormAnswer.optional(), label: Label.optional()}

export const integrationContract = {
  list: oc.output(located(EffectSchema.Array(Integration.Info))),
  get: oc
    .errors(engineContractErrors('INTEGRATION_NOT_FOUND'))
    .input(IntegrationIdInput)
    .output(located(Integration.Info)),
  connect: {
    key: oc
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_POLICY', 'INTEGRATION_AUTHORIZATION'))
      .input(IntegrationIdInput.extend({key: Secret, answer: FormAnswer.optional(), label: Label.optional()}))
      .output(Ok),
    external: oc
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_POLICY', 'INTEGRATION_AUTHORIZATION'))
      .input(IntegrationIdInput.extend(ConnectFields))
      .output(Ok),
  },
  oauth: {
    connect: oc
      .errors(engineContractErrors('INTEGRATION_POLICY', 'INTEGRATION_AUTHORIZATION'))
      .input(IntegrationIdInput.extend(ConnectFields))
      .output(located(Integration.Attempt)),
    status: oc
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_ATTEMPT_NOT_FOUND'))
      .input(AttemptInput)
      .output(located(Integration.AttemptStatus)),
    complete: oc
      .errors(
        engineContractErrors(
          'INTEGRATION_NOT_FOUND',
          'INTEGRATION_ATTEMPT_NOT_FOUND',
          'INTEGRATION_CODE_REQUIRED',
          'INTEGRATION_AUTHORIZATION',
        ),
      )
      .input(AttemptInput.extend({code: z.string().max(16_384).optional()}))
      .output(Ok),
    cancel: oc.input(AttemptInput).output(Ok),
  },
  command: {
    connect: oc
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
    status: oc
      .errors(engineContractErrors('INTEGRATION_NOT_FOUND', 'INTEGRATION_ATTEMPT_NOT_FOUND'))
      .input(AttemptInput)
      .output(located(Integration.CommandAttemptStatus)),
    cancel: oc.input(AttemptInput).output(Ok),
  },
}

export const experimentalIntegrationContract = {
  wellknown: {
    add: oc
      .errors(engineContractErrors('INTEGRATION_POLICY', 'WELL_KNOWN_DISCOVERY'))
      .input(z.object({url: z.string().min(1).max(2048)}))
      .output(Ok),
  },
}
