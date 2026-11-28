import {handlerGen} from '@orpc/effect'
import type {ContractedRouter} from '@orpc/server'
import {Effect, Redacted} from 'effect'
import type {EvlogError} from 'evlog'
import type {contract} from '@conciv/protocol'
import {engineErrors, integrationErrors} from '@conciv/errors'
import {Integration, Location, ManagedPolicy} from '@conciv/backend-app-api'
import {os, type EngineRpcContext} from './mount.js'

const ok = {ok: true as const}

const isMcp = (integration: {readonly metadata?: {readonly source?: unknown}} | undefined) =>
  integration?.metadata?.source === 'mcp'

const statements = ManagedPolicy.ConfiguredPolicies.use((policies) =>
  Effect.succeed(ManagedPolicy.statements(policies)),
)

export const requireConnectable = Effect.fnUntraced(function* (integrationId: Integration.Id) {
  const integrations = yield* Integration.Service
  if (isMcp(yield* integrations.get(integrationId))) return
  const denied = ManagedPolicy.match(yield* statements, 'integration.connect', integrationId)
  if (denied?.effect !== 'deny') return
  return yield* Effect.fail(
    engineErrors.INTEGRATION_POLICY({message: `${denied.message}: connecting ${integrationId} is not allowed`}),
  )
})

const isCode = (error: EvlogError, factory: {readonly code: string}) => error.code === factory.code

const authenticationFailed = (error: EvlogError) => {
  if (isCode(error, engineErrors.HOME_UNREACHABLE)) return error
  return engineErrors.INTEGRATION_AUTHORIZATION({
    message: isCode(error, integrationErrors.AUTHORIZATION) ? error.message : 'Authentication failed',
    cause: error,
  })
}

const authorize = <A, R>(effect: Effect.Effect<A, EvlogError, R>) => effect.pipe(Effect.mapError(authenticationFailed))

const attemptMissing = (kind: string, attemptId: string) => (error: EvlogError) =>
  isCode(error, integrationErrors.ATTEMPT_NOT_FOUND)
    ? engineErrors.INTEGRATION_ATTEMPT_NOT_FOUND({message: `${kind} attempt not found: ${attemptId}`, cause: error})
    : error

const located = <A, E, R>(data: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const location = yield* Location.Service
    return {location: {directory: location.directory}, data: yield* data}
  })

const requireIntegration = Effect.fnUntraced(function* (integrationId: Integration.Id) {
  const integration = yield* Integration.Service.use((service) => service.get(integrationId))
  if (!integration)
    return yield* Effect.fail(engineErrors.INTEGRATION_NOT_FOUND({message: `Integration not found: ${integrationId}`}))
  return integration
})

const ids = (input: {readonly integrationId: string; readonly attemptId: string}) => ({
  integrationId: Integration.Id.make(input.integrationId),
  attemptId: Integration.AttemptId.make(input.attemptId),
})

export function integrationRouter(): ContractedRouter<typeof contract.integration, EngineRpcContext> {
  return {
    list: os.integration.list.handler(
      handlerGen(function* () {
        const service = yield* Integration.Service
        const current = yield* statements
        return yield* located(
          service
            .list()
            .pipe(
              Effect.map((integrations) =>
                integrations.filter(
                  (integration) =>
                    isMcp(integration) ||
                    ManagedPolicy.decision(current, 'integration.connect', integration.id) !== 'deny',
                ),
              ),
            ),
        )
      }),
    ),
    get: os.integration.get.handler(
      handlerGen(function* ({input}) {
        return yield* located(requireIntegration(Integration.Id.make(input.integrationId)))
      }),
    ),
    connect: {
      key: os.integration.connect.key.handler(
        handlerGen(function* ({input}) {
          const integrationId = Integration.Id.make(input.integrationId)
          yield* requireConnectable(integrationId)
          yield* requireIntegration(integrationId)
          yield* authorize(
            Integration.Service.use((service) =>
              service.connection.key({
                integrationId,
                key: Redacted.make(input.key),
                answer: input.answer,
                label: input.label,
              }),
            ),
          )
          return ok
        }),
      ),
      external: os.integration.connect.external.handler(
        handlerGen(function* ({input}) {
          const integrationId = Integration.Id.make(input.integrationId)
          yield* requireConnectable(integrationId)
          yield* requireIntegration(integrationId)
          yield* authorize(
            Integration.Service.use((service) =>
              service.connection.external({
                integrationId,
                methodId: Integration.MethodId.make(input.methodId),
                answer: input.answer,
                label: input.label,
              }),
            ),
          )
          return ok
        }),
      ),
    },
    oauth: {
      connect: os.integration.oauth.connect.handler(
        handlerGen(function* ({input}) {
          const integrationId = Integration.Id.make(input.integrationId)
          yield* requireConnectable(integrationId)
          return yield* located(
            authorize(
              Integration.Service.use((service) =>
                service.oauth.connect({
                  integrationId,
                  methodId: Integration.MethodId.make(input.methodId),
                  answer: input.answer,
                  label: input.label,
                }),
              ),
            ),
          )
        }),
      ),
      status: os.integration.oauth.status.handler(
        handlerGen(function* ({input}) {
          yield* requireIntegration(Integration.Id.make(input.integrationId))
          return yield* located(
            Integration.Service.use((service) => service.oauth.status(ids(input))).pipe(
              Effect.mapError(attemptMissing('OAuth', input.attemptId)),
            ),
          )
        }),
      ),
      complete: os.integration.oauth.complete.handler(
        handlerGen(function* ({input}) {
          yield* requireIntegration(Integration.Id.make(input.integrationId))
          yield* Integration.Service.use((service) => service.oauth.complete({...ids(input), code: input.code})).pipe(
            Effect.mapError((error) => {
              if (isCode(error, integrationErrors.ATTEMPT_NOT_FOUND))
                return attemptMissing('OAuth', input.attemptId)(error)
              if (isCode(error, integrationErrors.CODE_REQUIRED))
                return engineErrors.INTEGRATION_CODE_REQUIRED({cause: error})
              return authenticationFailed(error)
            }),
          )
          return ok
        }),
      ),
      cancel: os.integration.oauth.cancel.handler(
        handlerGen(function* ({input}) {
          yield* Integration.Service.use((service) => service.oauth.cancel(ids(input)))
          return ok
        }),
      ),
    },
    command: {
      connect: os.integration.command.connect.handler(
        handlerGen(function* ({input}) {
          const integrationId = Integration.Id.make(input.integrationId)
          yield* requireConnectable(integrationId)
          const integration = yield* requireIntegration(integrationId)
          if (!integration.methods.some((method) => method.type === 'command' && method.id === input.methodId))
            return yield* Effect.fail(
              engineErrors.INTEGRATION_METHOD_NOT_FOUND({message: `Integration method not found: ${input.methodId}`}),
            )
          return yield* located(
            authorize(
              Integration.Service.use((service) =>
                service.command.connect({
                  integrationId,
                  methodId: Integration.MethodId.make(input.methodId),
                  label: input.label,
                }),
              ),
            ),
          )
        }),
      ),
      status: os.integration.command.status.handler(
        handlerGen(function* ({input}) {
          yield* requireIntegration(Integration.Id.make(input.integrationId))
          return yield* located(
            Integration.Service.use((service) => service.command.status(ids(input))).pipe(
              Effect.mapError(attemptMissing('Command', input.attemptId)),
            ),
          )
        }),
      ),
      cancel: os.integration.command.cancel.handler(
        handlerGen(function* ({input}) {
          yield* Integration.Service.use((service) => service.command.cancel(ids(input)))
          return ok
        }),
      ),
    },
  }
}
