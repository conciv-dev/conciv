import type {Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import {Context, Effect, Layer} from 'effect'
import * as Bus from '../bus.js'
import type {Generation} from '../plugin.js'

export const Updated = Bus.ephemeral({type: 'sdk.plugin.updated', schema: {}})

export interface Interface {
  readonly register: (plugin: Plugin) => Effect.Effect<void>
  readonly all: () => readonly Generation[]
}

export const Service = Context.Service<Interface>('@conciv/SdkPlugins')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const plugins = new Map<string, Generation>()
    let revision = 0
    return Service.of({
      register: (plugin) =>
        Effect.sync(() => {
          plugins.set(plugin.id, {...plugin, revision: String(++revision), source: {type: 'sdk'}})
        }).pipe(Effect.andThen(bus.publish(Updated, {}, {global: true})), Effect.asVoid),
      all: () => [...plugins.values()],
    })
  }),
)
