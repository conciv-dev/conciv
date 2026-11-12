/** A JSON value, as plugin options in the conciv config hold. */
export type Json = string | number | boolean | null | readonly Json[] | {readonly [key: string]: Json}

export interface StorageEntry {
  readonly key: string
  readonly value: Json
}

export interface StorageScanOptions {
  readonly prefix: string
  readonly after?: string
  readonly limit?: number
}

export interface StorageScanResult {
  readonly entries: readonly StorageEntry[]
  readonly next?: string
}

export interface StorageDomain {
  /** The plugin's own folder on disk, created by the host. A plugin never sees another plugin's folder. */
  readonly directory: string
  readonly get: (key: string) => Promise<Json | undefined>
  readonly set: (key: string, value: Json) => Promise<void>
  readonly remove: (key: string) => Promise<void>
  readonly scan: (options: StorageScanOptions) => Promise<StorageScanResult>
}
