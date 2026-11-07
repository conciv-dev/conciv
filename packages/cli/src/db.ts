import {defineCommand} from 'citty'
import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {runRpc} from './request.js'

export function sourceCommands(scope: {prefix: string; label: string}) {
  const {prefix, label} = scope
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
        limit: {type: 'string', description: 'the most rows to return'},
      },
      run: ({args}) => {
        if (args.from === undefined) return listed(prefix)
        const limit = args.limit === undefined ? undefined : Number(args.limit)
        if (limit !== undefined && !Number.isInteger(limit))
          throw userFailure(`--limit takes a whole number, not ${args.limit}`)
        return runRpc((rpc) =>
          rpc.db.read({
            from: `${prefix}${args.from}`,
            ...(args.where === undefined ? {} : {where: args.where}),
            ...(args.select === undefined ? {} : {select: args.select.split(',').map((field) => field.trim())}),
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
      run: ({args}) => runRpc((rpc) => rpc.db.write({into: `${prefix}${args.into}`, values: valuesOf(args.values)})),
    }),
  }
}

function listed(prefix: string): Promise<CliOutcome> {
  return runRpc(async (rpc) =>
    (await rpc.db.sources())
      .filter((source) => source.name.startsWith(prefix))
      .map((source) => ({...source, name: source.name.slice(prefix.length)})),
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
