import {MessagePort, workerData} from 'node:worker_threads'
import {count, create, getByID, removeMultiple, search, upsert, upsertMultiple} from '@orama/orama'
import {os} from '@orpc/server'
import {RPCHandler} from '@orpc/server/message-port'
import {z} from 'zod'

const ListingSchema = z.object({
  id: z.string(),
  harness: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  sizeBytes: z.number().optional(),
})

const IndexedSchema = ListingSchema.extend({
  title: z.string().catch(''),
  updatedAt: z.number().catch(0),
  sizeBytes: z.number().optional().catch(undefined),
  body: z.string().catch(''),
  read: z.boolean(),
  readAt: z.number(),
  readUpdatedAt: z.number(),
})

const NOTHING_READ = {body: '', read: false, readAt: 0, readUpdatedAt: 0}

const CursorSchema = z.object({updatedAt: z.number(), id: z.string()})

const index = create({
  schema: {
    harness: 'enum',
    title: 'string',
    body: 'string',
    updatedAt: 'number',
    sizeBytes: 'number',
    read: 'boolean',
    readAt: 'number',
    readUpdatedAt: 'number',
  },
})

const router = {
  states: os.input(z.object({harness: z.string()})).handler(async ({input}) => {
    const found = await search(index, {where: {harness: {eq: input.harness}}, limit: count(index)})
    return found.hits.map((hit) => {
      const document = IndexedSchema.parse({...hit.document, id: hit.id})
      return {
        id: document.id,
        title: document.title,
        updatedAt: document.updatedAt,
        sizeBytes: document.sizeBytes,
        read: document.read,
        readAt: document.readAt,
        readUpdatedAt: document.readUpdatedAt,
      }
    })
  }),
  remove: os.input(z.object({ids: z.array(z.string())})).handler(async ({input}) => {
    await removeMultiple(index, input.ids)
  }),
  list: os.input(z.object({listings: z.array(ListingSchema)})).handler(async ({input}) => {
    await upsertMultiple(
      index,
      input.listings.map((listing) => {
        const {body, read, readAt, readUpdatedAt} = currentOf(listing.id) ?? NOTHING_READ
        return IndexedSchema.parse({...listing, body, read, readAt, readUpdatedAt})
      }),
    )
  }),
  read: os
    .input(
      z.object({listing: ListingSchema, text: z.string().nullable(), readAt: z.number(), readUpdatedAt: z.number()}),
    )
    .handler(async ({input}) => {
      const body = input.text ?? (currentOf(input.listing.id) ?? NOTHING_READ).body
      await upsert(
        index,
        IndexedSchema.parse({
          ...input.listing,
          body,
          read: input.text !== null,
          readAt: input.readAt,
          readUpdatedAt: input.readUpdatedAt,
        }),
      )
    }),
  rename: os.input(z.object({id: z.string(), title: z.string()})).handler(async ({input}) => {
    const current = currentOf(input.id)
    if (current === undefined) return
    await upsert(index, {...current, title: input.title})
  }),
  search: os
    .input(z.object({term: z.string(), tolerance: z.number(), after: CursorSchema.nullable(), limit: z.number()}))
    .handler(async ({input}) => {
      const matches = (updatedAt: {eq: number} | {lte: number} | undefined, limit: number) =>
        search(index, {
          term: input.term,
          properties: ['title', 'body'],
          tolerance: input.tolerance,
          threshold: 0,
          where: updatedAt === undefined ? undefined : {updatedAt},
          sortBy: {property: 'updatedAt', order: 'DESC'},
          limit,
        })
      const tiesAt = async (updatedAt: number) => (await matches({eq: updatedAt}, 0)).count
      const after = input.after
      const range = after === null ? undefined : {lte: after.updatedAt}
      const reach = input.limit + 1 + (after === null ? 0 : await tiesAt(after.updatedAt))
      const window = await matches(range, reach)
      const edge = window.hits.at(-1)?.document.updatedAt
      const found = edge === undefined ? window : await matches(range, reach + (await tiesAt(edge)))
      return found.hits.map((hit) => {
        const document = IndexedSchema.parse({...hit.document, id: hit.id})
        return {
          id: document.id,
          harness: document.harness,
          title: document.title,
          updatedAt: document.updatedAt,
          sizeBytes: document.sizeBytes,
        }
      })
    }),
}

export type SearchIndexRouter = typeof router

const {port} = z.object({port: z.instanceof(MessagePort)}).parse(workerData)
const handler = new RPCHandler(router)
handler.upgrade(port)
port.start()

function currentOf(id: string): z.infer<typeof IndexedSchema> | undefined {
  const found = getByID(index, id)
  return found === undefined ? undefined : IndexedSchema.parse({...found, id})
}
