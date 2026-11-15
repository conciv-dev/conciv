export interface Ref {
  readonly id: string
  readonly providerId: string | undefined
  readonly variant?: string
}

export type Type = 'chat' | 'decision' | 'image' | (string & {})

export interface Capabilities {
  tools: boolean
  freeform?: Array<'text' | 'regex' | 'lark'>
  input: Array<string>
  output: Array<string>
  temperature?: boolean
}

interface VariantSettings {
  compaction?: {type: 'summary'} | {type: 'native'}
  encoding?: 'zstd' | 'gzip' | 'none'
  [key: string]: unknown
}

export interface Variant {
  id: string
  headers?: Record<string, string>
  body?: Record<string, unknown>
  settings?: VariantSettings
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
  providerId: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  canonical?: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  type?: Type
  /** @remarks Not implemented yet. Always undefined in this version. */
  family?: string
  name: string
  capabilities: Capabilities
  variants: Array<Variant>
  time: {released: number}
  cost: Array<Cost>
  status: 'alpha' | 'beta' | 'deprecated' | 'active'
  enabled: boolean
  limit: {context: number; input?: number; output: number}
}
