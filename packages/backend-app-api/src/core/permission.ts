import {Context, Deferred, Effect, Layer} from 'effect'
import {EvlogError} from 'evlog'
import * as Permission from '@conciv/protocol/schema/permission'
import * as Identifier from '@conciv/protocol/schema/identifier'
import type * as Session from '@conciv/protocol/schema/session'
import type * as Tool from '@conciv/protocol/schema/tool'
import * as Bus from './bus.js'
import * as Location from './location.js'
import * as Agent from './agent.js'
import * as Wildcard from './util/wildcard.js'
import * as PermissionSaved from './permission/saved.js'
import {permissionErrors, sessionErrors} from '@conciv/errors'
import * as PluginHooks from './plugin/hooks.js'

const PermissionEffect = Permission.Effect
export {PermissionEffect as Effect}
export {Rule, Ruleset} from '@conciv/protocol/schema/permission'
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
  readonly fallback?: 'ask'
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

export {Event} from '@conciv/protocol/schema/permission'

export interface SessionRules {
  readonly agent?: Agent.Id
  readonly permissions?: Permission.Ruleset
}

export interface SessionsInterface {
  readonly get: (sessionId: Session.Id) => Effect.Effect<SessionRules | undefined>
}

export const PermissionSessions = Context.Service<SessionsInterface>('@conciv/PermissionSessions')

export const Unattended = Context.Reference<Permission.Ruleset | undefined>('@conciv/Permission/Unattended', {
  defaultValue: () => undefined,
})

function blocked(input: AssertInput, rules: Permission.Ruleset, reason: string | undefined): EvlogError {
  return permissionErrors.BLOCKED({
    permission: input.action,
    ...(reason === undefined ? {} : {message: reason}),
    internal: {rules, permission: input.action, resources: input.resources},
  })
}

export function isDeclined(value: unknown): value is EvlogError {
  return EvlogError.isEvlogError(value) && value.code === permissionErrors.DECLINED.code
}

export function isRefused(value: unknown): value is EvlogError {
  return (
    EvlogError.isEvlogError(value) &&
    (value.code === permissionErrors.BLOCKED.code || value.code === permissionErrors.CORRECTED.code)
  )
}

function rejection(message: string | undefined): EvlogError {
  return message ? permissionErrors.CORRECTED({feedback: message}) : permissionErrors.DECLINED()
}

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
  readonly ask: (input: AssertInput) => Effect.Effect<AskResult, EvlogError>
  readonly assert: (input: AssertInput) => Effect.Effect<void, EvlogError>
  readonly assertNotDenied: (input: AssertInput) => Effect.Effect<void, EvlogError>
  readonly allows: (input: AssertInput) => Effect.Effect<boolean, EvlogError>
  readonly reply: (input: ReplyInput) => Effect.Effect<void, EvlogError>
  readonly get: (id: Id) => Effect.Effect<Request | undefined>
  readonly forSession: (sessionId: Session.Id) => Effect.Effect<ReadonlyArray<Request>>
  readonly list: () => Effect.Effect<ReadonlyArray<Request>>
}

export const Service = Context.Service<Interface>('@conciv/Permission')

interface Pending {
  readonly request: Request
  readonly agent?: Agent.Id
  readonly fallback?: 'ask'
  readonly deferred: Deferred.Deferred<void, EvlogError>
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
    const ids = yield* Identifier.Service
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
          .pipe(Effect.ensuring(Deferred.fail(item.deferred, permissionErrors.DECLINED()))),
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

    const configured = Effect.fnUntraced(function* (input: AssertInput) {
      const session = yield* sessions.get(input.sessionId)
      if (!session)
        return yield* Effect.fail(
          sessionErrors.NOT_FOUND({sessionId: input.sessionId, internal: {sessionId: input.sessionId}}),
        )
      const agent = yield* agents.resolve(input.agent ?? session.agent)
      if (!agent) return merge(missingAgentPermissions, session.permissions ?? [])
      return merge(agent.permissions, fallbackRules(input, agent.permissions), session.permissions ?? [])
    })

    function fallbackRules(input: AssertInput, rules: Permission.Ruleset): Permission.Ruleset {
      const effect = input.fallback
      if (!effect) return []
      return input.resources
        .filter((resource) => {
          const rule = evaluate(input.action, resource, rules)
          return rule.effect === 'allow' && rule.action === '*'
        })
        .map((resource) => ({action: input.action, resource, effect}))
    }

    function denied(input: Pick<Request, 'action' | 'resources'>, rules: Permission.Ruleset) {
      return input.resources.some((resource) => evaluate(input.action, resource, rules).effect === 'deny')
    }

    function relevant(input: AssertInput, rules: Permission.Ruleset) {
      return rules.filter((rule) => Wildcard.match(input.action, rule.action))
    }

    const evaluateInput = Effect.fnUntraced(function* (input: AssertInput) {
      const rules = yield* configured(input)
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
      const unattended = yield* Unattended
      if (event.effect !== 'ask' || unattended === undefined)
        return {effect: event.effect, message: event.message, rules: all}
      const settled = [...all, ...unattended]
      const allowed = input.resources.every((resource) => evaluate(input.action, resource, settled).effect === 'allow')
      if (allowed) return {effect: 'allow' as const, rules: all}
      return {
        effect: 'deny' as const,
        message: `Permission ${input.action} needs approval, and nobody is present to give it`,
        rules: all,
      }
    })

    function request(input: AssertInput, message?: string): Request {
      return {
        id: input.id ?? Id.create(ids),
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

    const create = (request: Request, input: Pick<AssertInput, 'agent' | 'fallback'>) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<void, EvlogError>()
          const item: Pending = {request, agent: input.agent, fallback: input.fallback, deferred}
          if (closed) {
            yield* Deferred.fail(deferred, permissionErrors.DECLINED())
            return item
          }
          if (pending.has(request.id))
            return yield* Effect.die(permissionErrors.DUPLICATE_PENDING_ID({requestId: request.id}))
          pending.set(request.id, item)
          yield* bus
            .publish(Permission.Event.Asked, request)
            .pipe(Effect.onError(() => Effect.sync(() => pending.delete(request.id))))
          return item
        }),
      )

    const ask = Effect.fn('Permission.ask')(function* (input: AssertInput) {
      if (closed) return {id: input.id ?? Id.create(ids), effect: 'deny' as const}
      const result = yield* evaluateInput(input)
      const value = request(input, result.message)
      if (result.effect === 'ask') yield* create(value, input)
      return {id: value.id, effect: result.effect}
    })

    const assert = Effect.fn('Permission.assert')((input: AssertInput) =>
      Effect.gen(function* () {
        if (closed) return yield* Effect.die(permissionErrors.DECLINED())
        const result = yield* evaluateInput(input)
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            if (result.effect === 'deny') {
              return yield* Effect.fail(blocked(input, relevant(input, result.rules), result.message))
            }
            if (result.effect === 'allow') return
            const item = yield* create(request(input, result.message), input)
            return yield* restore(Deferred.await(item.deferred)).pipe(
              Effect.catchIf((error) => error.code === permissionErrors.DECLINED.code, Effect.die),
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
      yield* Effect.annotateCurrentSpan({sessionId: input.sessionId})
      const result = yield* evaluateInput(input)
      if (result.effect !== 'deny') return
      return yield* Effect.fail(blocked(input, relevant(input, result.rules), result.message))
    })

    const allows = Effect.fn('Permission.allows')(function* (input: AssertInput) {
      yield* Effect.annotateCurrentSpan({sessionId: input.sessionId})
      if (closed) return false
      return (yield* evaluateInput(input)).effect === 'allow'
    })

    const reply = Effect.fn('Permission.reply')((input: ReplyInput) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const existing = pending.get(input.requestId)
          if (!existing) return yield* Effect.fail(permissionErrors.REQUEST_NOT_FOUND({requestId: input.requestId}))
          yield* bus.publish(Permission.Event.Replied, {
            sessionId: existing.request.sessionId,
            requestId: existing.request.id,
            reply: input.reply,
          })

          if (input.reply === 'reject') {
            yield* Deferred.fail(existing.deferred, rejection(input.message))
            pending.delete(input.requestId)
            for (const [id, item] of pending) {
              if (item.request.sessionId !== existing.request.sessionId) continue
              yield* bus.publish(Permission.Event.Replied, {
                sessionId: item.request.sessionId,
                requestId: item.request.id,
                reply: 'reject',
              })
              yield* Deferred.fail(item.deferred, rejection(input.message))
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
            const result = yield* evaluateInput({...item.request, agent: item.agent, fallback: item.fallback}).pipe(
              Effect.catchIf(
                (error) => error.code === sessionErrors.NOT_FOUND.code,
                () => Effect.undefined,
              ),
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
      yield* Effect.annotateCurrentSpan({sessionId})
      return Array.from(pending.values(), (item) => item.request).filter((request) => request.sessionId === sessionId)
    })

    return Service.of({ask, assert, assertNotDenied, allows, reply, get, forSession, list, close})
  }),
)
