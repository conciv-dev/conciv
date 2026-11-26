import {MessagePort, workerData} from 'node:worker_threads'
import {count, create, getByID, removeMultiple, search, upsert, upsertMultiple} from '@orama/orama'
import {boundedLevenshtein} from '@orama/orama/internals'
import {uniq} from 'es-toolkit'
import {os, type Procedure, type Schema} from '@orpc/server'
import {RPCHandler} from '@orpc/server/message-port'
import {z} from 'zod'

const ListingSchema = z.object({
  id: z.string(),
  harness: z.string(),
  cwd: z.string(),
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

const EXCERPT_LENGTH = 300

const EXCERPT_LEAD = 80

type Property = 'title' | 'body'

const WORD = /[\p{L}\p{N}_'-]+/gu

const StatesInputSchema = z.object({harness: z.string()})
const RemoveInputSchema = z.object({ids: z.array(z.string())})
const ListInputSchema = z.object({listings: z.array(ListingSchema)})
const ReadInputSchema = z.object({
  listing: ListingSchema,
  text: z.string().nullable(),
  readAt: z.number(),
  readUpdatedAt: z.number(),
})
const RenameInputSchema = z.object({id: z.string(), title: z.string()})
const SearchInputSchema = z.object({
  term: z.string(),
  tolerance: z.number(),
  cwd: z.string().nullable(),
  after: CursorSchema.nullable(),
  limit: z.number(),
})

type IndexProcedure<Input extends z.ZodType, Output> = Procedure<
  Record<never, never>,
  Record<never, never>,
  Input,
  Schema<Output, Output>,
  Record<never, never>,
  Record<never, never>
>
type IndexedListing = {
  id: string
  harness: string
  cwd: string
  title: string
  updatedAt: number
  sizeBytes: number | undefined
  excerpt: string | null
  matched: string[]
}
type ReadState = {
  id: string
  cwd: string
  title: string
  updatedAt: number
  sizeBytes: number | undefined
  read: boolean
  readAt: number
  readUpdatedAt: number
}

export type SearchIndexRouter = {
  states: IndexProcedure<typeof StatesInputSchema, ReadState[]>
  remove: IndexProcedure<typeof RemoveInputSchema, void>
  list: IndexProcedure<typeof ListInputSchema, void>
  read: IndexProcedure<typeof ReadInputSchema, void>
  rename: IndexProcedure<typeof RenameInputSchema, void>
  search: IndexProcedure<typeof SearchInputSchema, IndexedListing[]>
}

const index = create({
  schema: {
    harness: 'enum',
    cwd: 'enum',
    title: 'string',
    body: 'string',
    updatedAt: 'number',
    sizeBytes: 'number',
    read: 'boolean',
    readAt: 'number',
    readUpdatedAt: 'number',
  },
})

const router: SearchIndexRouter = {
  states: os.input(StatesInputSchema).handler(async ({input}) => {
    const found = await search(index, {where: {harness: {eq: input.harness}}, limit: count(index)})
    return found.hits.map((hit) => {
      const document = IndexedSchema.parse({...hit.document, id: hit.id})
      return {
        id: document.id,
        cwd: document.cwd,
        title: document.title,
        updatedAt: document.updatedAt,
        sizeBytes: document.sizeBytes,
        read: document.read,
        readAt: document.readAt,
        readUpdatedAt: document.readUpdatedAt,
      }
    })
  }),
  remove: os.input(RemoveInputSchema).handler(async ({input}) => {
    await removeMultiple(index, input.ids)
  }),
  list: os.input(ListInputSchema).handler(async ({input}) => {
    await upsertMultiple(
      index,
      input.listings.map((listing) => {
        const {body, read, readAt, readUpdatedAt} = readCurrent(listing.id) ?? NOTHING_READ
        return IndexedSchema.parse({...listing, body, read, readAt, readUpdatedAt})
      }),
    )
  }),
  read: os.input(ReadInputSchema).handler(async ({input}) => {
    const current = readCurrent(input.listing.id) ?? {...input.listing, ...NOTHING_READ}
    await upsert(
      index,
      IndexedSchema.parse({
        ...input.listing,
        title: current.title,
        body: input.text ?? current.body,
        read: input.text !== null,
        readAt: input.readAt,
        readUpdatedAt: input.readUpdatedAt,
      }),
    )
  }),
  rename: os.input(RenameInputSchema).handler(async ({input}) => {
    const current = readCurrent(input.id)
    if (current === undefined) return
    await upsert(index, {...current, title: input.title})
  }),
  search: os.input(SearchInputSchema).handler(async ({input}) => {
    const matches = (updatedAt: {eq: number} | {lte: number} | undefined, limit: number) =>
      search(index, {
        term: input.term,
        properties: ['title', 'body'],
        tolerance: input.tolerance,
        threshold: 0,
        where: buildWhere(input.cwd, updatedAt),
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
    const queryTokens = index.tokenizer.tokenize(input.term, undefined, undefined, false)
    return found.hits.map((hit) => {
      const document = IndexedSchema.parse({...hit.document, id: hit.id})
      return {
        id: document.id,
        harness: document.harness,
        cwd: document.cwd,
        title: document.title,
        updatedAt: document.updatedAt,
        sizeBytes: document.sizeBytes,
        ...buildExcerpt(document, queryTokens, input.tolerance),
      }
    })
  }),
}

const {port} = z.object({port: z.instanceof(MessagePort)}).parse(workerData)
const handler = new RPCHandler(router)
handler.upgrade(port)
port.start()

function buildWhere(cwd: string | null, updatedAt: {eq: number} | {lte: number} | undefined) {
  return {...(cwd === null ? {} : {cwd: {eq: cwd}}), ...(updatedAt === undefined ? {} : {updatedAt})}
}

function readCurrent(id: string): z.infer<typeof IndexedSchema> | undefined {
  const found = getByID(index, id)
  return found === undefined ? undefined : IndexedSchema.parse({...found, id})
}

function buildExcerpt(
  document: {title: string; body: string},
  queryTokens: string[],
  tolerance: number,
): {excerpt: string | null; matched: string[]} {
  const body = document.body
  const inTitle = matchedWords(document.title, 'title', queryTokens, tolerance)
  const first = firstMatchAt(body, queryTokens, tolerance)
  if (first === undefined) return {excerpt: null, matched: inTitle}
  const lineStart = body.lastIndexOf('\n', first - 1) + 1
  const start = excerptStart(body, lineStart, first)
  const boundary = body.slice(start + EXCERPT_LENGTH).search(/\s/)
  const end = boundary < 0 ? body.length : start + EXCERPT_LENGTH + boundary
  const excerpt = body.slice(start, end).trimEnd()
  const matched = uniq([...inTitle, ...matchedWords(excerpt, 'body', queryTokens, tolerance)])
  return {excerpt: start > lineStart ? `…${excerpt}` : excerpt, matched}
}

function excerptStart(body: string, lineStart: number, first: number): number {
  if (first - lineStart <= EXCERPT_LENGTH) return lineStart
  const lead = first - EXCERPT_LEAD
  const floor = Math.max(lineStart, lead - EXCERPT_LEAD)
  const gap = body.slice(floor, lead + 1).search(/\s\S*$/)
  return gap < 0 ? lead : floor + gap + 1
}

function matchedWords(text: string, property: Property, queryTokens: string[], tolerance: number): string[] {
  return uniq(
    Array.from(text.matchAll(WORD), (word) => word[0]).filter((word) =>
      wordMatches(word, property, queryTokens, tolerance),
    ),
  )
}

function firstMatchAt(body: string, queryTokens: string[], tolerance: number): number | undefined {
  for (const word of body.matchAll(WORD)) {
    if (wordMatches(word[0], 'body', queryTokens, tolerance)) return word.index
  }
  return undefined
}

function wordMatches(word: string, property: Property, queryTokens: string[], tolerance: number): boolean {
  return index.tokenizer
    .tokenize(word, undefined, property, false)
    .some((token) =>
      queryTokens.some(
        (queryToken) => token.startsWith(queryToken) || boundedLevenshtein(queryToken, token, tolerance).isBounded,
      ),
    )
}
