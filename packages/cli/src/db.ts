import {z} from 'zod'
import {command, description, name, option, schema} from '@bomb.sh/router'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {localCatalog, type LocalCatalog} from './local-catalog.js'
import {handler} from './router/handler.js'

const QueryModelSchema = z.object({
  from: z.string().optional(),
  where: z.string().optional(),
  select: z.string().optional(),
  order: z.string().optional(),
  limit: z.int().optional(),
})

const WriteModelSchema = z.object({into: z.string(), values: z.string()})

export function sourceCommands(scope: {extension?: string; label: string; prefix?: string}) {
  const {extension, label} = scope
  const scoped = extension === undefined ? {} : {extension}
  const prefix = scope.prefix ?? ''
  return [
    command(
      name(`${prefix}query`),
      description(`read ${label} sources; with no --from, list every source and its fields`),
      option(name('from'), description('the source to read'), schema(z.string().optional())),
      option(
        name('where'),
        description('a CEL predicate over the source fields, e.g. round == 3 && kind in ["text"]'),
        schema(z.string().optional()),
      ),
      option(name('select'), description('comma-separated field names'), schema(z.string().optional())),
      option(
        name('order'),
        description('comma-separated fields to sort by, -field for descending'),
        schema(z.string().optional()),
      ),
      option(name('limit'), description('the most rows to return'), schema(z.int().optional())),
      envelopeFlag,
      handler((model) => query({...QueryModelSchema.parse(model), scoped, extension})),
    ),
    command(
      name(`${prefix}write`),
      description(`write a row into a writable source of ${label}`),
      option(name('into'), description('the writable source'), schema(z.string())),
      option(name('values'), description('the row as a JSON object of field to value'), schema(z.string())),
      envelopeFlag,
      handler((model) => {
        const {into, values} = WriteModelSchema.parse(model)
        const row = valuesOf(values)
        return catalogOutcome({code: 'QUERY_FAILED', work: (sources) => sources.write({...scoped, into, values: row})})
      }),
    ),
  ]
}

function query(
  input: z.infer<typeof QueryModelSchema> & {scoped: {extension?: string}; extension: string | undefined},
): Promise<CliOutcome> {
  const {from, scoped, extension} = input
  if (from === undefined) return catalogOutcome({code: 'QUERY_FAILED', work: (sources) => sources.list(extension)})
  return catalogOutcome({
    code: 'QUERY_FAILED',
    work: (sources) =>
      sources.read({
        ...scoped,
        from,
        ...(input.where === undefined ? {} : {where: input.where}),
        ...(input.select === undefined ? {} : {select: input.select.split(',').map((field) => field.trim())}),
        ...(input.order === undefined ? {} : {order: orderOf(input.order)}),
        ...(input.limit === undefined ? {} : {limit: input.limit}),
      }),
  })
}

async function catalogOutcome(input: {
  code: string
  work: (sources: LocalCatalog['sources']) => unknown
}): Promise<CliOutcome> {
  const {sources} = localCatalog()
  try {
    return {report: 'json', data: await input.work(sources)}
  } catch (error) {
    throw userFailure(error instanceof Error ? error.message : String(error), {code: input.code})
  }
}

function orderOf(raw: string): {field: string; dir: 'asc' | 'desc'}[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .map((entry): {field: string; dir: 'asc' | 'desc'} =>
      entry.startsWith('-') ? {field: entry.slice(1), dir: 'desc'} : {field: entry, dir: 'asc'},
    )
}

function valuesOf(raw: string): Record<string, unknown> {
  const parsed: unknown = jsonOf(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw userFailure('--values takes a JSON object of field to value')
  return Object.fromEntries(Object.entries(parsed))
}

function jsonOf(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw userFailure(`--values is not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}
