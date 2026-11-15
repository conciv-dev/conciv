export * as Permission from './permission.js'

import {Context, Deferred, Effect, Layer, Schema} from 'effect'
import {Permission} from '../schema/permission.js'
import type {Session} from '../schema/session.js'
import type {Tool} from '../schema/tool.js'
import {Bus} from './bus.js'
import {Location} from './location.js'
import {Agent} from './agent.js'
import {SessionErrors} from './session/error.js'
import {Wildcard} from './util/wildcard.js'
import {PermissionSaved} from './permission/saved.js'
import {PluginHooks} from './plugin/hooks.js'

const PermissionEffect = Permission.Effect
export {PermissionEffect as Effect}
export {Rule, Ruleset} from '../schema/permission.js'
const missingAgentPermissions: Permission.Ruleset = [{action: '*', resource: '*', effect: 'deny'}]

export const Id = Permission.Id
export type Id = typeof Id.Type

export const Source = Permission.Source
export type Source = typeof Source.Type

export const Request = Permission.Request
export type Request = typeof Request.Type

export const Reply = Permission.Reply
export type Reply = typeof Reply.Type

export interface AssertInput extends Omit<Request, 'id' | 'message'> {
  readonly id?: Id
  readonly agent?: Agent.Id
}

export const invocation = (context: Pick<Tool.Context, 'sessionId' | 'agent' | 'messageId' | 'id'>) => ({
  sessionId: context.sessionId,
  agent: context.agent,
  source: {type: 'tool' as const, messageId: context.messageId, id: context.id},
})

export interface ReplyInput {
  readonly requestId: Id
  readonly reply: Reply
  readonly message?: string
}

export interface AskResult {
  readonly id: Id
  readonly effect: Permission.Effect
}

export {Event} from '../schema/permission.js'

export interface SessionRules {
  readonly agent?: Agent.Id
  readonly permissions?: Permission.Ruleset
}

export interface SessionsInterface {
  readonly get: (sessionId: Session.Id) => Effect.Effect<SessionRules | undefined>
}

export const PermissionSessions = Context.Service<SessionsInterface>('@conciv/PermissionSessions')

export const DeclinedError = Schema.TaggedStruct('Permission.DeclinedError', {})
export type DeclinedError = typeof DeclinedError.Type & globalThis.Error

export const makeDeclinedError = (): DeclinedError =>
  Object.assign(new globalThis.Error(), DeclinedError.make({}), {name: 'Permission.DeclinedError'})

export const CorrectedError = Schema.TaggedStruct('Permission.CorrectedError', {
  feedback: Schema.String,
})
export type CorrectedError = typeof CorrectedError.Type & globalThis.Error

export const makeCorrectedError = (fields: Omit<typeof CorrectedError.Type, '_tag'>): CorrectedError =>
  Object.assign(new globalThis.Error(fields.feedback), CorrectedError.make(fields), {
    name: 'Permission.CorrectedError',
  })

export const BlockedError = Schema.TaggedStruct('Permission.BlockedError', {
  rules: Permission.Ruleset,
  permission: Schema.String,
  resources: Schema.Array(Schema.String),
  reason: Schema.String.pipe(Schema.optional),
})
export type BlockedError = typeof BlockedError.Type & globalThis.Error

export const makeBlockedError = (fields: Omit<typeof BlockedError.Type, '_tag'>): BlockedError =>
  Object.assign(
    new globalThis.Error(fields.reason ?? `Permission denied: ${fields.permission}`),
    BlockedError.make(fields),
    {name: 'Permission.BlockedError'},
  )

export const NotFoundError = Schema.TaggedStruct('Permission.NotFoundError', {
  requestId: Id,
})
export type NotFoundError = typeof NotFoundError.Type & globalThis.Error

export const makeNotFoundError = (fields: Omit<typeof NotFoundError.Type, '_tag'>): NotFoundError =>
  Object.assign(new globalThis.Error(), NotFoundError.make(fields), {name: 'Permission.NotFoundError'})

export type Error = BlockedError | CorrectedError

export function evaluate(action: string, resource: string, ...rulesets: Permission.Ruleset[]): Permission.Rule {
  return (
    rulesets
      .flat()
      .findLast((rule) => Wildcard.match(action, rule.action) && Wildcard.match(resource, rule.resource)) ?? {
      action,
      resource: '*',
      effect: 'ask',
    }
  )
}

export function merge(...rulesets: Permission.Ruleset[]): Permission.Ruleset {
  return rulesets.flat()
}

export interface Interface {
  readonly close: Effect.Effect<void>
  readonly ask: (input: AssertInput) => Effect.Effect<AskResult, SessionErrors.NotFoundError>
  readonly assert: (input: AssertInput) => Effect.Effect<void, Error | SessionErrors.NotFoundError>
  readonly assertNotDenied: (input: AssertInput) => Effect.Effect<void, BlockedError | SessionErrors.NotFoundError>
  readonly allows: (input: AssertInput) => Effect.Effect<boolean, SessionErrors.NotFoundError>
  readonly reply: (input: ReplyInput) => Effect.Effect<void, NotFoundError>
  readonly get: (id: Id) => Effect.Effect<Request | undefined>
  readonly forSession: (sessionId: Session.Id) => Effect.Effect<ReadonlyArray<Request>>
  readonly list: () => Effect.Effect<ReadonlyArray<Request>>
}

export const Service = Context.Service<Interface>('@opencode/Permission')

interface Pending {
  readonly request: Request
  readonly agent?: Agent.Id
  readonly deferred: Deferred.Deferred<void, DeclinedError | CorrectedError>
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const location = yield* Location.Service
    const agents = yield* Agent.Service
    const sessions = yield* PermissionSessions
    const saved = yield* PermissionSaved.Service
    const hooks = yield* PluginHooks.Service
    const pending = new Map<Id, Pending>()
    let closed = false

    const close = Effect.gen(function* () {
      closed = true
      yield* Effect.forEach(Array.from(pending.values()), (item) =>
        bus
          .publish(Permission.Event.Replied, {
            sessionId: item.request.sessionId,
            requestId: item.request.id,
            reply: 'reject',
          })
          .pipe(Effect.ensuring(Deferred.fail(item.deferred, makeDeclinedError()))),
      )
      pending.clear()
    }).pipe(Effect.uninterruptible)
    yield* Effect.addFinalizer(() => close)

    const savedRules = Effect.fnUntraced(function* () {
      return (yield* saved.list({projectId: location.project.id})).map((item): Permission.Rule => ({
        action: item.action,
        resource: item.resource,
        effect: 'allow',
      }))
    })

    const configured = Effect.fnUntraced(function* (sessionId: Session.Id, agentId?: Agent.Id) {
      const session = yield* sessions.get(sessionId)
      if (!session) return yield* Effect.fail(SessionErrors.makeNotFoundError({sessionId}))
      const agent = yield* agents.resolve(agentId ?? session.agent)
      return merge(agent?.permissions ?? missingAgentPermissions, session.permissions ?? [])
    })

    function denied(input: Pick<Request, 'action' | 'resources'>, rules: Permission.Ruleset) {
      return input.resources.some((resource) => evaluate(input.action, resource, rules).effect === 'deny')
    }

    function relevant(input: AssertInput, rules: Permission.Ruleset) {
      return rules.filter((rule) => Wildcard.match(input.action, rule.action))
    }

    const evaluateInput = Effect.fnUntraced(function* (input: AssertInput) {
      const rules = yield* configured(input.sessionId, input.agent)
      if (denied(input, rules)) return {effect: 'deny' as const, rules}
      const all = [...rules, ...(yield* savedRules())]
      const effects = input.resources.map((resource) => evaluate(input.action, resource, all).effect)
      const effect: Permission.Effect = effects.includes('ask') ? 'ask' : 'allow'
      const event = yield* hooks.trigger('permission', 'evaluate', {
        sessionId: input.sessionId,
        agent: input.agent,
        action: input.action,
        resources: input.resources,
        metadata: input.metadata,
        source: input.source,
        effect,
      })
      return {effect: event.effect, message: event.message, rules: all}
    })

    function request(input: AssertInput, message?: string): Request {
      return {
        id: input.id ?? Id.create(),
        sessionId: input.sessionId,
        action: input.action,
        resources: input.resources,
        save: input.save,
        metadata:
          input.metadata &&
          Object.fromEntries(Object.entries(input.metadata).filter(([, value]) => value !== undefined)),
        source: input.source,
        message,
      }
    }

    const create = (request: Request, agent?: Agent.Id) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<void, DeclinedError | CorrectedError>()
          const item = {request, agent, deferred}
          if (closed) {
            yield* Deferred.fail(deferred, makeDeclinedError())
            return item
          }
          if (pending.has(request.id))
            return yield* Effect.die(new Error(`Duplicate pending permission ID: ${request.id}`))
          pending.set(request.id, item)
          yield* bus
            .publish(Permission.Event.Asked, request)
            .pipe(Effect.onError(() => Effect.sync(() => pending.delete(request.id))))
          return item
        }),
      )

    const ask = Effect.fn('Permission.ask')(function* (input: AssertInput) {
      if (closed) return {id: input.id ?? Id.create(), effect: 'deny' as const}
      const result = yield* evaluateInput(input)
      const value = request(input, result.message)
      if (result.effect === 'ask') yield* create(value, input.agent)
      return {id: value.id, effect: result.effect}
    })

    const assert = Effect.fn('Permission.assert')((input: AssertInput) =>
      Effect.gen(function* () {
        if (closed) return yield* Effect.die(makeDeclinedError())
        const result = yield* evaluateInput(input)
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            if (result.effect === 'deny') {
              return yield* Effect.fail(
                makeBlockedError({
                  rules: relevant(input, result.rules),
                  permission: input.action,
                  resources: input.resources,
                  reason: result.message,
                }),
              )
            }
            if (result.effect === 'allow') return
            const item = yield* create(request(input, result.message), input.agent)
            return yield* restore(Deferred.await(item.deferred)).pipe(
              Effect.catchTag('Permission.DeclinedError', (error) => Effect.die(error)),
              Effect.ensuring(
                Effect.sync(() => {
                  pending.delete(item.request.id)
                }),
              ),
            )
          }),
        )
      }),
    )

    const assertNotDenied = Effect.fn('Permission.assertNotDenied')(function* (input: AssertInput) {
      const result = yield* evaluateInput(input)
      if (result.effect !== 'deny') return
      return yield* Effect.fail(
        makeBlockedError({
          rules: relevant(input, result.rules),
          permission: input.action,
          resources: input.resources,
          reason: result.message,
        }),
      )
    })

    const allows = Effect.fn('Permission.allows')(function* (input: AssertInput) {
      if (closed) return false
      return (yield* evaluateInput(input)).effect === 'allow'
    })

    const reply = Effect.fn('Permission.reply')((input: ReplyInput) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const existing = pending.get(input.requestId)
          if (!existing) return yield* Effect.fail(makeNotFoundError({requestId: input.requestId}))
          yield* bus.publish(Permission.Event.Replied, {
            sessionId: existing.request.sessionId,
            requestId: existing.request.id,
            reply: input.reply,
          })

          if (input.reply === 'reject') {
            yield* Deferred.fail(
              existing.deferred,
              input.message ? makeCorrectedError({feedback: input.message}) : makeDeclinedError(),
            )
            pending.delete(input.requestId)
            for (const [id, item] of pending) {
              if (item.request.sessionId !== existing.request.sessionId) continue
              yield* bus.publish(Permission.Event.Replied, {
                sessionId: item.request.sessionId,
                requestId: item.request.id,
                reply: 'reject',
              })
              yield* Deferred.fail(
                item.deferred,
                input.message ? makeCorrectedError({feedback: input.message}) : makeDeclinedError(),
              )
              pending.delete(id)
            }
            return
          }

          if (input.reply === 'always' && existing.request.save?.length) {
            yield* saved.add({
              projectId: location.project.id,
              action: existing.request.action,
              resources: existing.request.save,
            })
          }
          yield* Deferred.succeed(existing.deferred, undefined)
          pending.delete(input.requestId)
          if (input.reply !== 'always' || !existing.request.save?.length) return

          for (const [id, item] of pending) {
            const result = yield* evaluateInput({...item.request, agent: item.agent}).pipe(
              Effect.catchTag('Session.NotFoundError', () => Effect.undefined),
            )
            if (result?.effect !== 'allow') continue
            yield* bus.publish(Permission.Event.Replied, {
              sessionId: item.request.sessionId,
              requestId: item.request.id,
              reply: 'always',
            })
            yield* Deferred.succeed(item.deferred, undefined)
            pending.delete(id)
          }
        }),
      ),
    )

    const list = Effect.fn('Permission.list')(function* () {
      return Array.from(pending.values(), (item) => item.request)
    })

    const get = Effect.fn('Permission.get')(function* (id: Id) {
      return pending.get(id)?.request
    })

    const forSession = Effect.fn('Permission.forSession')(function* (sessionId: Session.Id) {
      return Array.from(pending.values(), (item) => item.request).filter((request) => request.sessionId === sessionId)
    })

    return Service.of({ask, assert, assertNotDenied, allows, reply, get, forSession, list, close})
  }),
)
