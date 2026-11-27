import type {Effect} from 'effect'
import type {Transform} from './registration.js'

export interface SourceMap {
  readonly version: number
  readonly mappings: string
  readonly names: string[]
  readonly sources: string[]
  readonly sourcesContent?: (string | null)[] | undefined
  readonly file?: string | undefined
  readonly sourceRoot?: string | undefined
}

export type BundlerCode =
  | string
  | {readonly code: string; readonly map?: string | SourceMap | null | undefined}
  | null
  | undefined

export interface BundlerHooks {
  readonly transform?: (code: string, id: string) => Effect.Effect<BundlerCode, unknown>
  readonly resolveId?: (id: string, importer: string | undefined) => Effect.Effect<string | null | undefined, unknown>
  readonly load?: (id: string) => Effect.Effect<BundlerCode, unknown>
}

export interface BundlerEditor {
  add(hooks: BundlerHooks): void
}

export interface BundlerDomain {
  readonly transform: Transform<BundlerEditor>
}
