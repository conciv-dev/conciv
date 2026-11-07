import {parse, printHelp, printVersion} from '@bomb.sh/router'
import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import {routeFailure} from './arguments.js'
import {writeFailure, writeOutcome} from './envelope.js'
import {failureOf} from './failure.js'
import {handlerOf} from './router/handler.js'
import type {main} from './main.js'
import {liveCatalog, type LiveCatalog} from './tool-group.js'

const ModelSchema = z.record(z.string(), z.unknown())

const TabModelSchema = z.object({tab: SessionId.optional()}).loose()

const ModelsSchema = z.record(z.string(), TabModelSchema)

type Parsed = ReturnType<typeof parse<typeof main>>

type Settled = {result: Exclude<Parsed, {resume: unknown}>; offline: string[]}

export async function runCli(app: typeof main, argv: string[]): Promise<number> {
  try {
    const {result, offline} = await settle(parse(app, {argv}), [])
    if (!result.ok) return writeFailure(routeFailure(result))
    if (result.method === 'help') return printHelpOf(result, offline)
    if (result.method === 'version') {
      console.log(printVersion(result))
      return 0
    }
    const run = handlerOf(result.definition)
    if (run === null) throw new Error(`the route ${result.route} has no handler`)
    const model = ModelSchema.parse(result.model)
    const tab = Object.values(ModelsSchema.parse(result.models)).find((routeModel) => routeModel.tab !== undefined)?.tab
    return await writeOutcome(Promise.resolve().then(() => run(model, {tab: tab ?? null})))
  } catch (error) {
    return writeFailure(failureOf(error))
  }
}

async function settle(parsed: Parsed, offline: string[]): Promise<Settled> {
  if (!('resume' in parsed)) return {result: parsed, offline}
  const catalog: LiveCatalog = await liveCatalog({tab: TabModelSchema.parse(parsed.model).tab ?? null})
  const noun = parsed.route.split('/').at(-1) ?? parsed.route
  return settle(parsed.resume(catalog), catalog === null ? [...offline, noun] : offline)
}

function printHelpOf(result: Parameters<typeof printHelp>[0], offline: string[]): number {
  console.log(printHelp(result))
  for (const noun of offline) {
    console.log(`offline: showing the built-in ${noun} capabilities; a running server may add more`)
  }
  return 0
}
