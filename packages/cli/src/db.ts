import {z} from 'zod'
import {command, description, name, option, schema, toggle} from '@bomb.sh/router'
import type {SourcePage, SourceRead} from '@conciv/db'
import {uniq} from 'es-toolkit'
import {dashValue} from './dash-value.js'
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
  cursor: z.string().optional(),
  single: z.boolean().optional(),
  json: z.boolean().optional(),
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
      option(name('from'), dashValue, description('the source to read'), schema(z.string().optional())),
      option(
        name('where'),
        dashValue,
        description('a CEL predicate over the source fields, e.g. round == 3 && kind in ["text"]'),
        schema(z.string().optional()),
      ),
      option(
        name('select'),
        dashValue,
        description('a CEL expression per row: a map prints a table, e.g. {"round": round, "kind": kind}'),
        schema(z.string().optional()),
      ),
      option(
        name('order'),
        dashValue,
        description('comma-separated fields to sort by, -field for descending'),
        schema(z.string().optional()),
      ),
      option(name('limit'), dashValue, description('the most rows to return'), schema(z.int().optional())),
      option(
        name('cursor'),
        dashValue,
        description('the next of a page read with the same --order'),
        schema(z.string().optional()),
      ),
      toggle(name('single'), description('return exactly one row, bare; anything else is an error')),
      toggle(name('json'), description('print {results, total, next} as one JSON envelope')),
      handler((model) => query({...QueryModelSchema.parse(model), scoped, extension})),
    ),
    command(
      name(`${prefix}write`),
      description(`write a row into a writable source of ${label}`),
      option(name('into'), dashValue, description('the writable source'), schema(z.string())),
      option(name('values'), dashValue, description('the row as a JSON object of field to value'), schema(z.string())),
      envelopeFlag,
      handler((model) => {
        const {into, values} = WriteModelSchema.parse(model)
        const row = valuesOf(values)
        return catalogOutcome({
          code: 'QUERY_FAILED',
          work: async (sources) => jsonOutcome(await sources.write({...scoped, into, values: row})),
        })
      }),
    ),
  ]
}

function query(input: QueryModel & {scoped: {extension?: string}; extension: string | undefined}): Promise<CliOutcome> {
  const {from, scoped, extension} = input
  if (from === undefined)
    return catalogOutcome({code: 'QUERY_FAILED', work: (sources) => jsonOutcome(sources.list(extension))})
  return catalogOutcome({
    code: 'QUERY_FAILED',
    work: async (sources) => reported({input, page: await sources.read({...scoped, ...readOf({...input, from})})}),
  })
}

type QueryModel = z.infer<typeof QueryModelSchema>

function readOf(input: QueryModel & {from: string}): SourceRead {
  if (input.single === true && (input.limit !== undefined || input.cursor !== undefined))
    throw new Error('--single returns one row and takes neither --limit nor --cursor')
  if (input.cursor !== undefined && input.order === undefined)
    throw new Error('--cursor takes --order: pass the --order the cursor was read with')
  return {
    from: input.from,
    ...(input.where === undefined ? {} : {where: input.where}),
    ...(input.select === undefined ? {} : {select: input.select}),
    ...(input.order === undefined ? {} : {order: orderOf(input.order)}),
    ...(input.limit === undefined ? {} : {limit: input.limit}),
    ...(input.cursor === undefined ? {} : {cursor: input.cursor}),
  }
}

function reported(input: {input: QueryModel; page: SourcePage}): CliOutcome {
  const {page} = input
  const json = input.input.json === true
  if (input.input.single !== true) return json ? jsonOutcome(page) : textOutcome(page.results, page.next)
  if (page.total !== 1) throw new Error(`--single expects exactly one row; the query matched ${page.total} rows`)
  return json ? jsonOutcome(page.results[0]) : textOutcome(page.results)
}

function jsonOutcome(data: unknown): CliOutcome {
  return {report: 'json', data}
}

function textOutcome(results: SourcePage['results'], next: string | null = null): CliOutcome {
  const lines = [...linesOf(results), ...(next === null ? [] : [`next: ${next}`])]
  return {report: 'text', text: lines.map((line) => `${line}\n`).join('')}
}

function linesOf(results: SourcePage['results']): string[] {
  const present = results.filter((value) => value !== null && value !== undefined)
  if (present.length > 0 && present.every(isRecord)) return tableOf(results, uniq(present.flatMap(Object.keys)))
  if (present.length > 0 && present.every(Array.isArray))
    return tableOf(
      results,
      Array.from({length: Math.max(...present.map((entry) => entry.length))}, (_, at) => `${at}`),
    )
  return results.map((value) => (value === null || value === undefined ? 'null' : cellOf(value)))
}

function tableOf(results: SourcePage['results'], headers: string[]): string[] {
  const rows = results.map((value) =>
    headers.map((header) => cellOf(isRecord(value) || Array.isArray(value) ? Reflect.get(value, header) : null)),
  )
  const widths = headers.map((header, at) => Math.max(header.length, ...rows.map((row) => row[at]?.length ?? 0)))
  return [headers, ...rows].map((row) =>
    row
      .map((cell, at) => cell.padEnd(widths[at] ?? 0))
      .join('  ')
      .trimEnd(),
  )
}

function cellOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function catalogOutcome(input: {
  code: string
  work: (sources: LocalCatalog['sources']) => CliOutcome | Promise<CliOutcome>
}): Promise<CliOutcome> {
  const {sources} = localCatalog()
  try {
    return await input.work(sources)
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
