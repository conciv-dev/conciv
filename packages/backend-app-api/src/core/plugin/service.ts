export * as Plugin from './service.js'

import {Plugin} from '@conciv/protocol/schema/plugin'
import type {Plugin as PluginDefinition, Services, TaggedError} from '@conciv/backend-plugin-api/effect/plugin'
import {Context, type Effect, type Exit} from 'effect'

export interface Interface {
  readonly activate: (plugins: readonly Generation[], failures?: readonly Failure[]) => Effect.Effect<void>
  readonly list: () => Effect.Effect<Plugin.Info[]>
  readonly experimental: (id: Plugin.Id) => Effect.Effect<Plugin.ExperimentalBundle | undefined, Plugin.ChunkNotFound>
  readonly experimentalChunk: (
    id: Plugin.Id,
    file: string,
  ) => Effect.Effect<Plugin.ExperimentalChunks | undefined, Plugin.ChunkNotFound>
  readonly close: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
  readonly awaitActivation: Effect.Effect<void>
  readonly hold: () => Effect.Effect<Effect.Effect<void>>
}

export type Failure = Plugin.Info & {readonly state: Extract<Plugin.State, {readonly status: 'failed'}>}

export type Generation = PluginDefinition<Services, TaggedError> & {
  readonly revision: string
  readonly source?: Plugin.Source
  readonly features?: Plugin.Features
  readonly options?: typeof Plugin.Options.Type
  readonly experimental?: Omit<Plugin.ExperimentalBundle, 'chunks' | 'file'> & {
    readonly file: string
    readonly chunks: Chunks
  }
}

export type Chunks = {
  readonly start: readonly string[]
  readonly files: ReadonlyMap<string, {readonly sha256: string; readonly imports: readonly string[]}>
}

export const Service = Context.Service<Interface>('@conciv/Plugin')

export const awaitActivation = Service.use((plugins) => plugins.awaitActivation)
