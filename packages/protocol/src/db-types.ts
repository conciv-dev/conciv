import type {z} from 'zod'

export type Conversions<TFrom, TTo> = {[K in keyof TTo]?: (value: unknown, row: TFrom) => TTo[K]}

export type ServerCollectionSpec<T> = {
  schema: z.ZodType<T>
  columns: string
  fts?: string[]
}

export type ServerCollection<T> = {
  name: string
  query: (filter?: Partial<T> & {search?: string; limit?: number}) => Promise<T[]>
  insert: (row: T) => Promise<T>
  update: (cid: string, patch: Partial<T>) => Promise<T>
  delete: (cid: string) => Promise<void>
  recordApiName: string
}

export type CollectionInfo = {name: string; table: string; schema: object; fts: string[]}

export type LiveDb = {
  collection: <T extends {cid: string}>(name: string, spec: ServerCollectionSpec<T>) => ServerCollection<T>
  list: () => CollectionInfo[]
  get: (name: string) => ServerCollection<{cid: string}> | null
}

export type ClientCollectionSpec<TItem, TRecord> = {
  schema: z.ZodType<TItem>
  parse: Conversions<TRecord, TItem>
  serialize: Conversions<TItem, TRecord>
}

export type ClientDb = {
  collection: <TItem extends {cid: string}, TRecord = TItem, TCollection = unknown>(
    name: string,
    spec: ClientCollectionSpec<TItem, TRecord>,
  ) => TCollection
}
