import {parse, printHelp, printVersion} from '@bomb.sh/router'
import {z} from 'zod'
import {ToolCommandSignatureSchema} from '@conciv/contract'
import {routeFailure} from './arguments.js'
import {writeFailure, writeOutcome} from './envelope.js'
import {failureOf} from './failure.js'
import {handlerOf} from './router/handler.js'
import type {main} from './main.js'
import {runRpc} from './request.js'

const ModelSchema = z.record(z.string(), z.unknown())

const CatalogSchema = z.array(ToolCommandSignatureSchema)

type Parsed = ReturnType<typeof parse<typeof main>>

type Settled = Exclude<Parsed, {resume: unknown}>

export async function runCli(app: typeof main, argv: string[]): Promise<number> {
  try {
    const result = await settle(parse(app, {argv}))
    if (!result.ok) return writeFailure(routeFailure(result))
    if (result.method === 'help') {
      console.log(printHelp(result))
      return 0
    }
    if (result.method === 'version') {
      console.log(printVersion(result))
      return 0
    }
    const run = handlerOf(result.definition)
    if (run === null) throw new Error(`the route ${result.route} has no handler`)
    const model = ModelSchema.parse(result.model)
    return await writeOutcome(Promise.resolve().then(() => run(model)))
  } catch (error) {
    return writeFailure(failureOf(error))
  }
}

async function settle(parsed: Parsed): Promise<Settled> {
  if (!('resume' in parsed)) return parsed
  return settle(parsed.resume(CatalogSchema.parse(await liveCatalog())))
}

async function liveCatalog(): Promise<unknown> {
  const outcome = await runRpc((rpc) => rpc.registry.catalog(undefined))
  if (outcome.report !== 'json') throw new Error('the registry catalog returned no data')
  return outcome.data
}
