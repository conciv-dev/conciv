import type {RequestOptions} from './domains.js'
import type {PublicRef} from './location.js'
import type {Transform} from './registration.js'

export interface Ref {
  readonly id: string
  /** Not implemented yet. Always undefined in this version. */
  readonly providerId: string | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly variant?: string
}

export type Type = 'chat' | 'decision' | 'image' | (string & {})

export interface Capabilities {
  tools: boolean
  /** Freeform tool input formats advertised by the selected API. Absent or empty means JSON tools only. */
  freeform?: Array<'text' | 'regex' | 'lark'>
  input: Array<string>
  output: Array<string>
  /** Whether the model accepts a sampling temperature. Unknown when unset. */
  temperature?: boolean
}

export interface Variant {
  id: string
}

export interface Cost {
  tier?: {type: 'context'; size: number}
  input: number
  output: number
  cache: {read: number; write: number}
}

export interface Info {
  id: string
  modelId: string
  /** Not implemented yet. Always undefined in this version. */
  providerId: string | undefined
  /** Not implemented yet. Always undefined in this version. */
  canonical?: string
  /** Not implemented yet. Always undefined in this version. */
  type?: Type
  /** Not implemented yet. Always undefined in this version. */
  family?: string
  name: string
  /** Not implemented yet. Always undefined in this version. */
  capabilities: Capabilities | undefined
  /** Not implemented yet. Always undefined in this version. */
  variants: Array<Variant> | undefined
  /** Not implemented yet. Always undefined in this version. */
  time: {released: number} | undefined
  /** Not implemented yet. Always undefined in this version. */
  cost: Array<Cost> | undefined
  /** Not implemented yet. Always undefined in this version. */
  status: 'alpha' | 'beta' | 'deprecated' | 'active' | undefined
  enabled: boolean
  /** Not implemented yet. Always undefined in this version. */
  limit: {context: number; input?: number; output: number} | undefined
}

export interface ModelListInput {
  readonly types?: ReadonlyArray<'chat' | 'decision' | 'image' | (string & {})> | undefined
}

export interface ModelEditor {
  /** Candidates from available providers, including models disabled by earlier transforms. */
  list(providerId?: string): readonly Info[]
  get(providerId: string, modelId: string): Info | undefined
  /** Edits raw model overrides; cannot create an unavailable provider. */
  update(providerId: string, modelId: string, update: (model: Info) => void): void
  remove(providerId: string, modelId: string): void
  readonly default: {
    get(): {providerId: string; modelId: string} | undefined
    set(providerId: string, modelId: string): void
  }
}

export interface ModelDomain {
  readonly list: (
    input?: ModelListInput,
    requestOptions?: RequestOptions,
  ) => Promise<{location: PublicRef; data: Array<Info>}>
  readonly default: (requestOptions?: RequestOptions) => Promise<{location: PublicRef; data: Info | null}>
  /** Not implemented yet. Always undefined in this version. */
  readonly transform: Transform<ModelEditor> | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly reload: (() => Promise<void>) | undefined
}
