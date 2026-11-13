import type {Json} from './experimental/core.js'

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
