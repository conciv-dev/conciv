export * as PluginHooks from './hooks.js'

import type {SessionHooks} from '../../plugin/effect/session.js'
import type {ToolFailures, ToolHooks} from '../../plugin/effect/tool.js'
import type {PermissionHooks} from '../../plugin/effect/permission.js'
import {Context, Effect, Layer, Scope} from 'effect'
import {State} from '../state.js'

export interface Domains {
  readonly session: SessionHooks
  readonly permission: PermissionHooks
  readonly tool: ToolHooks
}

type NoFailures<Spec> = {readonly [Name in keyof Spec]: never}

interface Failures extends Record<keyof Domains, unknown> {
  readonly session: NoFailures<SessionHooks>
  readonly permission: NoFailures<PermissionHooks>
  readonly tool: ToolFailures
}

type Callback<Event, Error> = (event: Event) => Effect.Effect<void, Error>
type Entry = {readonly callback: Function}

export interface Interface {
  readonly has: <Domain extends keyof Domains>(
    domain: Domain,
    name: keyof Domains[Domain] & keyof Failures[Domain],
  ) => Effect.Effect<boolean>
  readonly register: <Domain extends keyof Domains, Name extends keyof Domains[Domain] & keyof Failures[Domain]>(
    domain: Domain,
    name: Name,
    callback: Callback<Domains[Domain][Name], Failures[Domain][Name]>,
  ) => Effect.Effect<State.Registration, never, Scope.Scope>
  readonly trigger: <Domain extends keyof Domains, Name extends keyof Domains[Domain] & keyof Failures[Domain]>(
    domain: Domain,
    name: Name,
    event: Domains[Domain][Name],
  ) => Effect.Effect<Domains[Domain][Name], Failures[Domain][Name]>
}

export const Service = Context.Service<Interface>('@opencode/PluginHooks')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const callbacks = new Map<string, Entry[]>()
    const key = (domain: keyof Domains, name: PropertyKey) => `${domain}.${String(name)}`

    const register: Interface['register'] = Effect.fn('PluginHooks.register')(function* (domain, name, callback) {
      const scope = yield* Scope.Scope
      const id = key(domain, name)
      let active = true
      const entry = {callback}
      callbacks.set(id, [...(callbacks.get(id) ?? []), entry])
      const dispose = Effect.sync(() => {
        if (!active) return
        active = false
        const next = (callbacks.get(id) ?? []).filter((item) => item !== entry)
        if (next.length === 0) callbacks.delete(id)
        else callbacks.set(id, next)
      })
      yield* Scope.addFinalizer(scope, dispose)
      return {dispose}
    })

    const trigger: Interface['trigger'] = Effect.fnUntraced(function* (domain, name, event) {
      for (const entry of callbacks.get(key(domain, name)) ?? []) {
        const result: Effect.Effect<void, Failures[typeof domain][typeof name]> = entry.callback(event)
        yield* result
      }
      return event
    })

    const has: Interface['has'] = (domain, name) =>
      Effect.sync(() => (callbacks.get(key(domain, name)) ?? []).length > 0)

    return Service.of({has, register, trigger})
  }),
)
