import * as Plugin from '@conciv/protocol/schema/plugin'
import type {BundlerCode, BundlerHooks} from '@conciv/backend-plugin-api/effect/bundler'
import type {Plugin as PluginDefinition, Services, TaggedError} from '@conciv/backend-plugin-api/effect/plugin'
import {Context, type Effect, type Exit, Schema} from 'effect'

export interface Interface {
  readonly activate: (plugins: readonly Generation[], failures?: readonly Failure[]) => Effect.Effect<void>
  readonly list: () => Effect.Effect<Plugin.Info[]>
  readonly transform: (code: string, id: string) => Effect.Effect<TransformedCode | null, BundlerHookFailed>
  readonly resolveId: (id: string, importer: string | undefined) => Effect.Effect<string | null, BundlerHookFailed>
  readonly load: (id: string) => Effect.Effect<TransformedCode | null, BundlerHookFailed>
  readonly experimental: (id: Plugin.Id) => Effect.Effect<Plugin.ExperimentalBundle | undefined, Plugin.ChunkNotFound>
  readonly experimentalChunk: (
    id: Plugin.Id,
    file: string,
  ) => Effect.Effect<Plugin.ExperimentalChunks | undefined, Plugin.ChunkNotFound>
  readonly close: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
  readonly awaitActivation: Effect.Effect<void>
  readonly hold: () => Effect.Effect<Effect.Effect<void>>
}

export type TransformedCode = Exclude<BundlerCode, string | null | undefined>

export type BundlerRegistration = {readonly plugin: string; readonly hooks: BundlerHooks}

export interface BundlerRegistry {
  add(hooks: BundlerHooks, plugin: string): void
}

export const BundlerHookFailed = Schema.TaggedStruct('Plugin.BundlerHookFailed', {
  hook: Schema.Literals(['transform', 'resolveId', 'load']),
  plugin: Schema.String,
  module: Schema.String,
  message: Schema.String,
})
export type BundlerHookFailed = typeof BundlerHookFailed.Type

export type BundlerHook = BundlerHookFailed['hook']

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
