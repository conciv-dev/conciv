declare module 'trailbase' {
  export type RecordId = string | number
  export interface RecordApi<T = Record<string, unknown>> {
    list(opts?: unknown): Promise<{records: T[]; total_count?: number}>
    read(id: RecordId, opt?: unknown): Promise<T>
    create(record: T): Promise<RecordId>
    update(id: RecordId, record: Partial<T>): Promise<void>
    delete(id: RecordId): Promise<void>
    subscribe(id: RecordId, opts?: unknown): Promise<ReadableStream>
    subscribeAll(opts?: unknown): Promise<ReadableStream>
  }
  export interface Client {
    records<T = Record<string, unknown>>(name: string): RecordApi<T>
  }
  export function initClient(site?: URL | string, opts?: unknown): Client
}
