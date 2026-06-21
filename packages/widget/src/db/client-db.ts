import {createCollection, type Collection} from '@tanstack/solid-db'
import {trailBaseCollectionOptions, type TrailBaseCollectionConfig} from '@tanstack/trailbase-db-collection'
import {initClient, type RecordApi, type RecordId} from 'trailbase'
import {z} from 'zod'

type ShapeOf<T> = Record<keyof T, unknown>

const Identified = z.object({id: z.union([z.string(), z.number()])})

export type ClientCollectionSpec<TItem extends ShapeOf<TRecord>, TRecord extends ShapeOf<TItem>> = Omit<
  TrailBaseCollectionConfig<TItem, TRecord>,
  'recordApi' | 'id' | 'getKey'
>

export type ClientDb = {
  collection: <TItem extends {cid: string} & ShapeOf<TRecord>, TRecord extends ShapeOf<TItem> = TItem>(
    name: string,
    spec: ClientCollectionSpec<TItem, TRecord>,
  ) => Collection<TItem>
}

function cidKeyedApi<TRecord extends {cid: string}>(api: RecordApi<TRecord>): RecordApi<TRecord> {
  const idByCid = async (cid: string): Promise<RecordId> => {
    const res = await api.list({filters: [{column: 'cid', op: 'equal', value: cid}], pagination: {limit: 1}})
    const row = res.records[0]
    if (!row) throw new Error(`no row for cid ${cid}`)
    return Identified.parse(row).id
  }
  return new Proxy(api, {
    get(target, prop, receiver) {
      if (prop === 'createBulk')
        return async (records: TRecord[]) => {
          await target.createBulk(records)
          return records.map((record) => record.cid)
        }
      if (prop === 'update')
        return async (key: RecordId, record: Partial<TRecord>) => target.update(await idByCid(String(key)), record)
      if (prop === 'delete') return async (key: RecordId) => target.delete(await idByCid(String(key)))
      return Reflect.get(target, prop, receiver)
    },
  })
}

export function createClientDb(coreBaseUrl: string): ClientDb {
  const client = initClient(coreBaseUrl)
  return {
    collection: <TItem extends {cid: string} & ShapeOf<TRecord>, TRecord extends ShapeOf<TItem> = TItem>(
      name: string,
      spec: ClientCollectionSpec<TItem, TRecord>,
    ) =>
      createCollection(
        trailBaseCollectionOptions({
          id: name,
          recordApi: cidKeyedApi(client.records<TRecord & {cid: string}>(name)),
          getKey: (row) => row.cid,
          ...spec,
        }),
      ),
  }
}
