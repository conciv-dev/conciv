import {parse, printHelp, printVersion} from '@bomb.sh/router'
import {z} from 'zod'
import {ToolCommandSignatureSchema} from '@conciv/contract'
import {SessionId} from '@conciv/protocol/chat-types'
import {routeFailure} from './arguments.js'
import {writeFailure, writeOutcome} from './envelope.js'
import {failureOf, userFailure} from './failure.js'
import {handlerOf} from './router/handler.js'
import type {main} from './main.js'
import {runRpc, type CliTarget} from './request.js'

const ModelSchema = z.record(z.string(), z.unknown())

const CatalogSchema = z.array(ToolCommandSignatureSchema)

const TAB_FLAG = '--tab'

const TabModelSchema = z.object({tab: SessionId.optional()}).loose()

const ModelsSchema = z.record(z.string(), TabModelSchema)

type Parsed = ReturnType<typeof parse<typeof main>>

type Settled = Exclude<Parsed, {resume: unknown}>

export async function runCli(app: typeof main, argv: string[]): Promise<number> {
  try {
    const tab = flaggedTab(argv)
    const result = await settle(parse(app, {argv}), {tab})
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
    const tabs = Object.values(ModelsSchema.parse(result.models)).flatMap((routeModel) => routeModel.tab ?? [])
    if ((tabs[0] ?? null) !== tab || tabs.some((each) => each !== tab)) {
      throw userFailure('--tab was given more than once with different tab ids.', {hint: 'pass --tab once.'})
    }
    return await writeOutcome(Promise.resolve().then(() => run(model, {tab})))
  } catch (error) {
    return writeFailure(failureOf(error))
  }
}

async function settle(parsed: Parsed, target: CliTarget): Promise<Settled> {
  if (!('resume' in parsed)) return parsed
  return settle(parsed.resume(CatalogSchema.parse(await liveCatalog(target))), target)
}

async function liveCatalog(target: CliTarget): Promise<unknown> {
  const outcome = await runRpc(target, (rpc) => rpc.registry.catalog(undefined))
  if (outcome.report !== 'json') throw new Error('the registry catalog returned no data')
  return outcome.data
}

function flaggedTab(argv: string[]): SessionId | null {
  const end = argv.indexOf('--')
  const flags = end === -1 ? argv : argv.slice(0, end)
  const index = flags.findIndex((arg) => arg === TAB_FLAG || arg.startsWith(`${TAB_FLAG}=`))
  const flag = flags[index]
  const raw = flag === TAB_FLAG ? flags[index + 1] : flag?.slice(TAB_FLAG.length + 1)
  return SessionId.safeParse(raw).data ?? null
}
