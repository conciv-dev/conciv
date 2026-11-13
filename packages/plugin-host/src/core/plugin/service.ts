export * as Plugin from './service.js'

import {Plugin} from '../../schema/plugin.js'
import type {Plugin as PluginDefinition} from '../../plugin/effect/plugin.js'
import {Context, type Effect, type Exit} from 'effect'

export interface Interface {
  readonly activate: (plugins: readonly Generation[], failures?: readonly Failure[]) => Effect.Effect<void>
  readonly list: () => Effect.Effect<Plugin.Info[]>
  readonly experimental: (id: Plugin.Id) => Effect.Effect<Plugin.ExperimentalBundle | undefined>
  readonly close: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
  readonly awaitActivation: Effect.Effect<void>
  readonly hold: () => Effect.Effect<Effect.Effect<void>>
}

export type Failure = Plugin.Info & {readonly state: Extract<Plugin.State, {readonly status: 'failed'}>}

export type Generation = PluginDefinition & {
  readonly revision: string
  readonly source?: Plugin.Source
  readonly features?: Plugin.Features
  readonly experimental?: {
    readonly file: string
    readonly revision: string
    readonly options: Plugin.ExperimentalBundle['options']
  }
}

export const Service = Context.Service<Interface>('@opencode/Plugin')

export const awaitActivation = Service.use((plugins) => plugins.awaitActivation)
