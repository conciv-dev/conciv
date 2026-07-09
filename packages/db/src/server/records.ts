import {initClient, type Client} from 'trailbase'
import {decorateError} from '@conciv/errors'
import {TABLES, type CoreTableName, type RowFor, type RowInputFor} from '../rows.js'

type FilterFor<K extends CoreTableName> = Partial<Record<Extract<keyof RowFor<K>, string>, string>>

export type ExtensionRecords = {
  list(api: string): Promise<unknown[]>
  create(api: string, body: Record<string, unknown>): Promise<string>
  update(api: string, id: string, patch: Record<string, unknown>): Promise<void>
  remove(api: string, id: string): Promise<void>
}

export type RecordsClient = {
  list<K extends CoreTableName>(api: K, filter?: FilterFor<K>): Promise<RowFor<K>[]>
  getBy<K extends CoreTableName>(
    api: K,
    field: Extract<keyof RowFor<K>, string>,
    value: string,
  ): Promise<RowFor<K> | null>
  create<K extends CoreTableName>(api: K, body: RowInputFor<K>): Promise<string>
  update<K extends CoreTableName>(api: K, id: string, patch: Partial<RowFor<K>>): Promise<void>
  remove(api: CoreTableName, id: string): Promise<void>
  extension: ExtensionRecords
}

async function guarded<T>(api: string, action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught))
    const status = 'status' in error ? error.status : undefined
    throw decorateError({
      error,
      code: 'records-request-failed',
      userCode: 'state.records-request-failed',
      statusCode: 502,
      details: {api, action, status},
    })
  }
}

function toFilters(filter: Record<string, string | undefined>): Array<{column: string; value: string}> {
  return Object.entries(filter).flatMap(([column, value]) => (value === undefined ? [] : [{column, value}]))
}

function rawList(client: Client, api: string, filter?: Record<string, string | undefined>): Promise<unknown[]> {
  return guarded(api, 'list', async () => {
    const response = await client.records(api).list({filters: toFilters(filter ?? {})})
    return response.records
  })
}

function rawCreate(client: Client, api: string, body: Record<string, unknown>): Promise<string> {
  return guarded(api, 'create', async () => String(await client.records(api).create(body)))
}

function rawUpdate(client: Client, api: string, id: string, patch: Record<string, unknown>): Promise<void> {
  return guarded(api, 'update', () => client.records(api).update(id, patch))
}

function rawRemove(client: Client, api: string, id: string): Promise<void> {
  return guarded(api, 'remove', () => client.records(api).delete(id))
}

function extensionRecords(client: Client): ExtensionRecords {
  return {
    list: (api) => rawList(client, api),
    create: (api, body) => rawCreate(client, api, body),
    update: (api, id, patch) => rawUpdate(client, api, id, patch),
    remove: (api, id) => rawRemove(client, api, id),
  }
}

function parseRows<K extends CoreTableName>(api: K, rows: unknown[]): RowFor<K>[] {
  return rows.map((row) => TABLES[api].schema.parse(row))
}

export function recordsClient(baseUrl: string): RecordsClient {
  const client = initClient(baseUrl)
  const list = async <K extends CoreTableName>(api: K, filter?: FilterFor<K>): Promise<RowFor<K>[]> =>
    parseRows(api, await rawList(client, api, filter))
  const getBy = async <K extends CoreTableName>(
    api: K,
    field: Extract<keyof RowFor<K>, string>,
    value: string,
  ): Promise<RowFor<K> | null> => {
    const filter: FilterFor<K> = {}
    filter[field] = value
    return (await list(api, filter))[0] ?? null
  }
  return {
    list,
    getBy,
    create: (api, body) => rawCreate(client, api, body),
    update: (api, id, patch) => rawUpdate(client, api, id, patch),
    remove: (api, id) => rawRemove(client, api, id),
    extension: extensionRecords(client),
  }
}
