import {defineCommand} from 'citty'
import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {runRpc} from './request.js'

export function sourceCommands(scope: {extension?: string; label: string}) {
  const {extension, label} = scope
  const scoped = extension === undefined ? {} : {extension}
  return {
    query: defineCommand({
      meta: {name: 'query', description: `read ${label} sources; with no --from, list every source and its fields`},
      args: {
        from: {type: 'string', description: 'the source to read'},
        where: {
          type: 'string',
          description: 'a CEL predicate over the source fields, e.g. round == 3 && kind in ["text"]',
        },
        select: {type: 'string', description: 'comma-separated field names'},
        order: {type: 'string', description: 'comma-separated fields to sort by, -field for descending'},
        limit: {type: 'string', description: 'the most rows to return'},
      },
      run: ({args}) => {
        const from = args.from
        if (from === undefined) return listed(extension)
        const limit = args.limit === undefined ? undefined : Number(args.limit)
        if (limit !== undefined && !Number.isInteger(limit))
          throw userFailure(`--limit takes a whole number, not ${args.limit}`)
        return runRpc((rpc) =>
          rpc.db.read({
            ...scoped,
            from,
            ...(args.where === undefined ? {} : {where: args.where}),
            ...(args.select === undefined ? {} : {select: args.select.split(',').map((field) => field.trim())}),
            ...(args.order === undefined ? {} : {order: orderOf(args.order)}),
            ...(limit === undefined ? {} : {limit}),
          }),
        )
      },
    }),
    write: defineCommand({
      meta: {name: 'write', description: `insert one row into a writable ${label} source`},
      args: {
        into: {type: 'string', required: true, description: 'the writable source'},
        values: {type: 'string', required: true, description: 'the row as a JSON object of field to value'},
      },
      run: ({args}) => runRpc((rpc) => rpc.db.write({...scoped, into: args.into, values: valuesOf(args.values)})),
    }),
  }
}

function listed(extension: string | undefined): Promise<CliOutcome> {
  return runRpc(async (rpc) => {
    const sources = await rpc.db.sources()
    if (extension === undefined) return sources
    return sources
      .filter((source) => source.extension === extension)
      .map((source) => ({...source, name: source.source}))
  })
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
