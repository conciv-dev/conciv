import type {Json} from '../experimental/core.js'
import type {StorageScanOptions, StorageScanResult} from '../storage.js'

export interface StorageDomain {
  readonly directory: string
  readonly get: (key: string) => Promise<Json | undefined>
  readonly set: (key: string, value: Json) => Promise<void>
  readonly remove: (key: string) => Promise<void>
  readonly scan: (options: StorageScanOptions) => Promise<StorageScanResult>
}
