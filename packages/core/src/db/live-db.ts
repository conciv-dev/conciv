import {z} from 'zod'
import {initClient, type Filter, type RecordApi, type RecordId} from 'trailbase'
import type {CollectionInfo, LiveDb, ServerCollection, ServerCollectionSpec} from '@mandarax/protocol/db-types'
import {emitMigration, writeTrailConfig} from './trail-config.js'

export type LiveDbOptions = {trailBaseUrl: string; dataDir: string}

type Stored<T> = T & {id: RecordId}

type TrailClient = ReturnType<typeof initClient>

const CidRow = z.looseObject({cid: z.string()})

type Entry = {info: CollectionInfo; schemaKey: string; collection: ServerCollection<{cid: string}>}

function equalsFilter(column: string, value: unknown): Filter {
  return {column, op: 'equal', value: String(value)}
}

function buildFilters<T>(columns: string[], filter?: Partial<T> & {search?: string; limit?: number}): Filter[] {
  const entries = Object.entries(filter ?? {}).filter(([key]) => key !== 'search' && key !== 'limit')
  const equality = entries.map(([key, value]) => equalsFilter(key, value))
  const term = filter?.search
  if (!term) return equality
  const search: Filter[] = columns.map((column) => ({column, op: 'like', value: `%${term}%`}))
  return [...equality, ...search]
}

function makeCollection<T extends {cid: string}>(
  name: string,
  fts: string[],
  parse: (raw: unknown) => T,
  client: TrailClient,
): ServerCollection<T> {
  const writeApi: RecordApi<T> = client.records<T>(name)
  const readApi: RecordApi<Stored<T>> = client.records<Stored<T>>(name)

  const rowsByCid = async (cid: string): Promise<Stored<T>[]> => {
    const res = await readApi.list({filters: [equalsFilter('cid', cid)], pagination: {limit: 1}})
    return res.records
  }
  const idByCid = async (cid: string): Promise<RecordId> => {
    const [row] = await rowsByCid(cid)
    if (!row) throw new Error(`no row for cid ${cid} in collection ${name}`)
    return row.id
  }
  const readBack = async (cid: string): Promise<T> => {
    const [row] = await rowsByCid(cid)
    if (!row) throw new Error(`row ${cid} vanished after write in collection ${name}`)
    return parse(row)
  }

  return {
    name,
    recordApiName: name,
    query: async (filter) => {
      const res = await readApi.list({filters: buildFilters(fts, filter), pagination: {limit: filter?.limit ?? 256}})
      return res.records.map((row) => parse(row))
    },
    insert: async (row) => {
      await writeApi.create(row)
      return readBack(row.cid)
    },
    update: async (cid, patch) => {
      await writeApi.update(await idByCid(cid), patch)
      return readBack(cid)
    },
    delete: async (cid) => {
      await writeApi.delete(await idByCid(cid))
    },
  }
}

export function createLiveDb(opts: LiveDbOptions): LiveDb {
  const client = initClient(opts.trailBaseUrl)
  const entries = new Map<string, Entry>()

  const rewriteConfig = (): void =>
    writeTrailConfig(
      opts.dataDir,
      [...entries.values()].map((e) => ({name: e.info.name})),
    )

  return {
    list: () => [...entries.values()].map((e) => e.info),
    get: (name) => entries.get(name)?.collection ?? null,
    collection: <T extends {cid: string}>(name: string, spec: ServerCollectionSpec<T>) => {
      const fts = spec.fts ?? []
      const schemaKey = JSON.stringify(z.toJSONSchema(spec.schema))
      const existing = entries.get(name)
      if (existing && existing.schemaKey !== schemaKey)
        throw new Error(`collection ${name} already declared with a different schema`)
      const typed = makeCollection<T>(name, fts, (raw) => spec.schema.parse(raw), client)
      if (existing) return typed
      const info: CollectionInfo = {name, table: name, schema: z.toJSONSchema(spec.schema), fts}
      const loose = makeCollection<{cid: string}>(name, fts, (raw) => CidRow.parse(raw), client)
      emitMigration(opts.dataDir, entries.size, name, spec.columns, fts)
      entries.set(name, {info, schemaKey, collection: loose})
      rewriteConfig()
      return typed
    },
  }
}
