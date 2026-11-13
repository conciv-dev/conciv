export type Id = string

export type Name = string

export interface Info {
  readonly id: Id
  readonly name: Name
  readonly description?: string
  readonly autoinvoke?: boolean
  readonly path: string
  readonly content: string
}
