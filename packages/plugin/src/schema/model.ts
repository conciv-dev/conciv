export interface Ref {
  readonly id: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly providerId: string | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
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
  /** @remarks Not implemented yet. Always undefined in this version. */
  providerId: string | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  canonical?: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  type?: Type
  /** @remarks Not implemented yet. Always undefined in this version. */
  family?: string
  name: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  capabilities: Capabilities | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  variants: Array<Variant> | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  time: {released: number} | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  cost: Array<Cost> | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  status: 'alpha' | 'beta' | 'deprecated' | 'active' | undefined
  enabled: boolean
  /** @remarks Not implemented yet. Always undefined in this version. */
  limit: {context: number; input?: number; output: number} | undefined
}
