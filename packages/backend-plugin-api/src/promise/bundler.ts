import type {BundlerCode} from '../effect/bundler.js'
import type {Transform} from './registration.js'

export type {BundlerCode, SourceMap} from '../effect/bundler.js'

export interface BundlerHooks {
  readonly transform?: (code: string, id: string) => BundlerCode | Promise<BundlerCode>
  readonly resolveId?: (
    id: string,
    importer: string | undefined,
  ) => string | null | undefined | Promise<string | null | undefined>
  readonly load?: (id: string) => BundlerCode | Promise<BundlerCode>
}

export interface BundlerEditor {
  add(hooks: BundlerHooks): void
}

export interface BundlerDomain {
  readonly transform: Transform<BundlerEditor>
}
